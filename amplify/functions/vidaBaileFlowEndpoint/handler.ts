import { DynamoDBClient, QueryCommand, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import * as crypto from "crypto";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import * as https from "https";

const ddb = new DynamoDBClient({
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 3000,
    socketTimeout: 5000,
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 })
  })
});
const TABLE_NAME = process.env.TABLE_NAME!;

// ────────────────────────────────────────────────────────────────────────────
// 1. Meta Flows Cryptography Engine
// ────────────────────────────────────────────────────────────────────────────
function decryptMetaRequest(body: any, privateKey: string) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;
  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(encrypted_aes_key, "base64")
  );
  const iv = Buffer.from(initial_vector, "base64");
  const flowBuffer = Buffer.from(encrypted_flow_data, "base64");
  const authTagOffset = flowBuffer.length - 16;
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(flowBuffer.subarray(authTagOffset));
  const payload = Buffer.concat([decipher.update(flowBuffer.subarray(0, authTagOffset)), decipher.final()]);
  return { aesKey, iv, data: JSON.parse(payload.toString("utf8")) };
}

function encryptMetaResponse(responseData: any, aesKey: Buffer, originalIv: Buffer) {
  const flippedIv = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) flippedIv[i] = ~originalIv[i];
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(responseData), "utf8")), cipher.final()]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Multi-Tenant Context Resolver
// ────────────────────────────────────────────────────────────────────────────
function resolveTenantSub(decryptedData: any): string {
  const token = decryptedData?.flow_token;
  if (token) {
    if (token.includes("_ADMIN#")) return token.split("_ADMIN#")[1];
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      if (decoded?.adminSub) return decoded.adminSub;
    } catch { /* Ignore base64 parse errors */ }
  }
  // Fallback for Meta Preview Panel & Health Checks (Controlled via Environment)
  if (process.env.DEFAULT_ADMIN_SUB) {
    console.log(`ℹ️ Using environment-configured default adminSub: ${process.env.DEFAULT_ADMIN_SUB}`);
    return process.env.DEFAULT_ADMIN_SUB;
  }
  throw new Error("Unauthorized Flow access: Missing tenant context.");
}

function resolveBroadcastId(decryptedData: any): string | null {
  const token = decryptedData?.flow_token;
  if (!token) return null;
  // Format: BUY_PACKAGE_<packageId>_CAMP#<broadcastId>_ADMIN#<adminSub>
  const campMatch = token.match(/_CAMP#([^_]+)_ADMIN#/);
  return campMatch?.[1] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Data Fetching Helpers
// ────────────────────────────────────────────────────────────────────────────
async function fetchActivePackages(adminSub: string) {
  // Get today's date in YYYY-MM-DD format to match your DynamoDB records
  const today = new Date().toISOString().split("T")[0]; 

  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": { S: adminSub },
      ":prefix": { S: "BROADCAST#" } // Target broadcast items
    }
  }));
  
  const items = res.Items || [];
  
  // 1. Filter out expired or future broadcasts
  // 2. Map to the Flow UI Schema
  return items.filter(item => {
    const validFrom = item.validFrom?.S;
    const validUntil = item.validUntil?.S;
    
    // Only include broadcasts where today falls within the valid range
    if (validFrom && validUntil) {
      return validFrom <= today && validUntil >= today;
    }
    return false;
  }).map(item => {
    // Extract the catalog ID from packageRef (e.g. "CATALOG#hgrnsPSmG_QW3GcrcFS5D")
    const rawPackageId = (item.packageRef?.S || item.packageIntent?.S || "").replace("CATALOG#", "");
    
    return {
      id: rawPackageId, 
      title: item.name?.S || "Dance Package",
      description: item.promotionalContent?.S 
        ? item.promotionalContent.S.substring(0, 60) 
        : "Exclusive dance offer"
    };
  });
}

async function fetchPackageById(adminSub: string, packageId: string) {
  const res = await ddb.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: { S: adminSub },
      sk: { S: `CATALOG#${packageId}` }
    }
  }));
  return res.Item;
}

async function fetchActiveBroadcastByPackageId(
  adminSub: string,
  packageId: string
): Promise<{ validFrom?: string; validUntil?: string } | null> {
  const today = new Date().toISOString().split("T")[0];
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk":     { S: adminSub },
      ":prefix": { S: "BROADCAST#" },
    },
  }));
  const match = (res.Items || []).find(item => {
    const ref = (item.packageRef?.S || item.packageIntent?.S || "").replace("CATALOG#", "");
    const vf  = item.validFrom?.S;
    const vu  = item.validUntil?.S;
    return ref === packageId && vf && vu && vf <= today && vu >= today;
  });
  if (!match) return null;
  return { validFrom: match.validFrom?.S, validUntil: match.validUntil?.S };
}

async function findReceiptPhone(adminSub: string, broadcastId: string): Promise<string | null> {
  // Query all BROADCAST#<id>#MEMBER#<phone> receipts for this broadcast
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk":     { S: adminSub },
      ":prefix": { S: `BROADCAST#${broadcastId}#MEMBER#` },
    },
    Limit: 1, // Flow is single-member context — take the first match
  }));
  const item = res.Items?.[0];
  if (!item) return null;
  // Extract phone from sk: BROADCAST#<id>#MEMBER#<phone>
  const skParts = item.sk?.S?.split("#MEMBER#");
  return skParts?.[1] ?? item.recipientPhone?.S ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Main Handler
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (event: any) => {
  console.log("🌊 Flow Endpoint Triggered");

  try {
    const rawKey = process.env.FLOW_PRIVATE_KEY || "";
    const PRIVATE_KEY = rawKey.replace(/\\n/g, '\n');
    if (!PRIVATE_KEY) console.error("❌ CRITICAL: FLOW_PRIVATE_KEY is missing.");

    let bodyStr = event.body || "{}";
    if (event.isBase64Encoded) bodyStr = Buffer.from(bodyStr, "base64").toString("utf8");
    const body = JSON.parse(bodyStr);

    const { aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY);
    console.log("🔓 Decrypted payload action:", decryptedData.action);

    if (decryptedData.action === "ping") {
      return { statusCode: 200, body: encryptMetaResponse({ data: { status: "active" } }, aesKey, iv) };
    }

    const adminSub = resolveTenantSub(decryptedData);
    let responseScreen = "";
    let responseData: any = {};
    
    // ── ROUTING STATE MACHINE ──
    if (decryptedData.action === "INIT") {
      const activePackages = await fetchActivePackages(adminSub);
      console.log(`📦 Found ${activePackages.length} packages for Admin: ${adminSub}`);

      responseScreen = "Packages_Screen";
      responseData = {
        packages_list: activePackages // Matches "${data.packages_list}" in Flow JSON
      };
      console.log(`📋 INIT response payload:`, JSON.stringify(responseData));
    }
    else if (decryptedData.action === "data_exchange") {
      const payload = decryptedData.data;
      console.log(`🔄 data_exchange payload:`, JSON.stringify(payload));
      
      if (payload.action === "FETCH_PACKAGE_DETAILS" || (payload.package_id && !payload.action)) {
        const pkg      = await fetchPackageById(adminSub, payload.package_id);
        const validity = await fetchActiveBroadcastByPackageId(adminSub, payload.package_id);
        const today    = new Date().toISOString().split("T")[0];
        responseScreen = "Package_Details_Screen";
        responseData = {
          package_id:            payload.package_id,
          package_title:         pkg?.packageType?.S || pkg?.name?.S || "Unknown Package",
          package_description:   `Price: ${pkg?.price?.N || "0"} BHD. Includes exclusive sessions.`,
          package_image_url:     "https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=600&auto=format&fit=crop",
          is_time_error_visible: false,
          time_error_msg:        "",
          // DatePicker bounds — constrain selection to the broadcast validity window
          valid_from:  validity?.validFrom  ?? today,
          valid_until: validity?.validUntil ?? "2099-12-31",
        };
      }
      else if (payload.action === "VALIDATE_BOOKING" || (payload.package_id && payload.date && payload.time && !payload.action)) {
        const selectedDateStr: string = payload.date; // YYYY-MM-DD
        const selectedDateTime = new Date(`${selectedDateStr}T${payload.time}:00`);
        const now = new Date();

        // ── 1. Check selected date is not in the past ────────────────────
        if (selectedDateTime < now) {
          // Re-fetch the package details to re-render the screen correctly
          const pkg = await fetchPackageById(adminSub, payload.package_id);
          responseScreen = "Package_Details_Screen";
          responseData = {
            package_id:            payload.package_id,
            package_title:         pkg?.packageType?.S || pkg?.name?.S || "Package",
            package_description:   `Price: ${pkg?.price?.N || "0"} BHD. Includes exclusive sessions.`,
            package_image_url:     "https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=600&auto=format&fit=crop",
            is_time_error_visible: true,
            time_error_msg:        "⚠️ The selected date/time has already passed. Please choose a future slot.",
          };
        } else {
          // ── 2. Check selected date is within the broadcast validity window ──
          // The validity range lives on the BROADCAST record, not the CATALOG.
          // Query active packages and find the one matching this packageId.
          const activePackages = await fetchActiveBroadcastByPackageId(adminSub, payload.package_id);
          const validFrom  = activePackages?.validFrom;   // YYYY-MM-DD or undefined
          const validUntil = activePackages?.validUntil;  // YYYY-MM-DD or undefined

          const isOutsideValidity =
            (validFrom  && selectedDateStr < validFrom) ||
            (validUntil && selectedDateStr > validUntil);

          if (isOutsideValidity) {
            const pkg = await fetchPackageById(adminSub, payload.package_id);
            const rangeMsg = validFrom && validUntil
              ? `Valid enrollment dates: ${validFrom} to ${validUntil}.`
              : validUntil ? `Must enroll before ${validUntil}.` : "Please select a valid date.";
            responseScreen = "Package_Details_Screen";
            responseData = {
              package_id:            payload.package_id,
              package_title:         pkg?.packageType?.S || pkg?.name?.S || "Package",
              package_description:   `Price: ${pkg?.price?.N || "0"} BHD. Includes exclusive sessions.`,
              package_image_url:     "https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=600&auto=format&fit=crop",
              is_time_error_visible: true,
              time_error_msg:        `⚠️ Selected date is outside the package enrollment window. ${rangeMsg}`,
            };
          } else {
            // ── 3. Date is valid — proceed to confirmation screen ──────────
            responseScreen = "Validation_Screen";
            responseData = {
              package_id:   payload.package_id,
              date:         payload.date,
              time:         payload.time,
              summary_text: `You are booking the ${validUntil ? `package valid until ${validUntil}` : "package"} starting ${payload.date} at ${payload.time}. Please confirm.`,
            };
          }
        }
      }
      else if (payload.action === "FINALIZE_SUBMISSION" || 
               (payload.package_id && payload.date && payload.time && payload.confirmed)) {
        const timestamp = new Date().toISOString();

        // Resolve broadcast context from the flow_token
        const broadcastId = resolveBroadcastId(decryptedData);
        if (broadcastId) {
          const recipientPhone = await findReceiptPhone(adminSub, broadcastId);
          if (recipientPhone) {
            const receiptSk = `BROADCAST#${broadcastId}#MEMBER#${recipientPhone}`;
            console.log(`✅ Confirming booking on receipt: ${receiptSk}`);
            await ddb.send(new UpdateItemCommand({
              TableName: TABLE_NAME,
              Key: {
                pk: { S: adminSub },
                sk: { S: receiptSk },
              },
              UpdateExpression:
                "SET memberBookingStatus = :status, validFrom = :date, startTime = :time, memberConfirmedAt = :ts, updatedAt = :ts",
              ExpressionAttributeValues: {
                ":status": { S: "BOOKED" },
                ":date":   { S: payload.date   || "" },
                ":time":   { S: payload.time   || "" },
                ":ts":     { S: timestamp },
              },
            }));
          } else {
            console.error(`❌ No receipt found for broadcastId: ${broadcastId}`);
          }
        } else {
          console.error(`❌ Could not parse broadcastId from flow_token: ${decryptedData?.flow_token}`);
        }

        responseScreen = "Terminal_Success";
        responseData = {};
      }
      else {
        // Unknown action — log it so we can diagnose unexpected payloads
        console.error(`❌ Unknown data_exchange action: ${payload?.action}. Full payload:`, JSON.stringify(payload));
        // Return the packages screen as a safe fallback so the user isn't stuck
        const activePackages = await fetchActivePackages(adminSub);
        responseScreen = "Packages_Screen";
        responseData = { packages_list: activePackages };
      }
    }

    return {
      statusCode: 200,
      body: encryptMetaResponse({ screen: responseScreen, data: responseData }, aesKey, iv)
    };

  } catch (err: any) {
    console.error("❌ Flow execution error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};