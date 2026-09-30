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
  const campMatch = token.match(/_CAMP#(.+?)_ADMIN#/);
  return campMatch?.[1] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Data Fetching Helpers
// ────────────────────────────────────────────────────────────────────────────

async function fetchActivePackages(adminSub: string, broadcastId: string | null) {
  const today = new Date().toISOString().split("T")[0]; 

  if (broadcastId) {
    // ── SCENARIO A: User clicked a Broadcast Message ──
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": { S: adminSub }, ":prefix": { S: "BROADCAST#" } }
    }));
    
    return (res.Items || []).filter(item => {
      const validFrom = item.validFrom?.S;
      const validUntil = item.validUntil?.S;
      if (validFrom && validUntil) return validFrom <= today && validUntil >= today;
      return false;
    }).map(item => {
      const bId = (item.sk?.S || "").replace("BROADCAST#", "");
      const cId = (item.packageRef?.S || item.packageIntent?.S || "").replace("CATALOG#", "");
      return {
        id: `${bId}|${cId}`,
        title: item.name?.S || "Dance Package",
        description: item.promotionalContent?.S ? item.promotionalContent.S.substring(0, 60) : "Exclusive offer",
      };
    });

  } else {
    // ── SCENARIO B: User asked the Chat Agent directly ──
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": { S: adminSub }, ":prefix": { S: "CATALOG#" } }
    }));
    
    return (res.Items || []).filter(item => (item.status?.S || "ACTIVE") === "ACTIVE").map(item => {
      const catalogPackageId = (item.sk?.S || "").replace("CATALOG#", "");
      return {
        id: catalogPackageId,
        title: item.name?.S || item.packageType?.S || "Dance Package",
        description: `Price: ${item.price?.N ?? item.price?.S ?? "Contact for price"} BHD.`
      };
    });
  }
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

  let decryptedAction: string | undefined;
  let body: any;

  try {
    const rawKey = process.env.FLOW_PRIVATE_KEY || "";
    const PRIVATE_KEY = rawKey.replace(/\\n/g, '\n');
    if (!PRIVATE_KEY) console.error("❌ CRITICAL: FLOW_PRIVATE_KEY is missing.");

    let bodyStr = event.body || "{}";
    if (event.isBase64Encoded) bodyStr = Buffer.from(bodyStr, "base64").toString("utf8");
    body = JSON.parse(bodyStr);

    let aesKey: Buffer, iv: Buffer, decryptedData: any;
    try {
      ({ aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY));
      decryptedAction = decryptedData.action;
    } catch (cryptoErr: any) {
      const isCryptoError =
        cryptoErr.message?.includes("RSA") ||
        cryptoErr.message?.includes("decrypt") ||
        cryptoErr.code === "ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR";
      console.error("❌ Decryption failed:", {
        errorMessage: cryptoErr.message,
        likelyCause: isCryptoError
          ? "RSA key mismatch — check FLOW_PRIVATE_KEY secret matches Meta Flow public key"
          : "Malformed payload",
        encryptedFieldsPresent: ["encrypted_aes_key", "encrypted_flow_data", "initial_vector"]
          .filter(k => body && k in body),
      });
      throw cryptoErr;
    }
    console.log("🔓 Decrypted payload action:", decryptedData.action);

    if (decryptedData.action === "ping") {
      return { statusCode: 200, body: encryptMetaResponse({ data: { status: "active" } }, aesKey, iv) };
    }

    const adminSub = resolveTenantSub(decryptedData);
    const broadcastId = resolveBroadcastId(decryptedData);
    let responseScreen = "";
    let responseData: any = {};
    
    // ── ROUTING STATE MACHINE ──
    if (decryptedData.action === "INIT") {
      const t0 = Date.now();
      const activePackages = await fetchActivePackages(adminSub, broadcastId);
      console.log(`⏱️ fetchActivePackages: ${Date.now() - t0}ms, found ${activePackages.length} packages`);
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
      
      // ── 0. Meta routing error notification — log and return Packages_Screen gracefully ──
      if (payload.error === "invalid-screen-transition") {
        console.error(`❌ Meta routing error: ${payload.error_message}`);
        const activePackages = await fetchActivePackages(adminSub, broadcastId);
        responseScreen = "Packages_Screen";
        responseData = { packages_list: activePackages };
      }
      
      // ── 1. FINALIZE_SUBMISSION — must be checked FIRST ──────────────────────────
      else if (payload.action === "FINALIZE_SUBMISSION" || payload.consent_given) {
        console.log(`🎯 FINALIZE_SUBMISSION: package=\({payload.package_id}, date=\){payload.date}, time=${payload.time}`);
        const timestamp = new Date().toISOString();

        try {
          const broadcastId = resolveBroadcastId(decryptedData);
          let memberPhone = "UNKNOWN_PHONE";

          // 1. Resolve the member's phone number
          if (broadcastId) {
             const receiptPhone = await findReceiptPhone(adminSub, broadcastId);
             if (receiptPhone) memberPhone = receiptPhone;
          } else if (decryptedData?.flow_token) {
             try {
               const decoded = JSON.parse(Buffer.from(decryptedData.flow_token, "base64").toString("utf8"));
               if (decoded.phone) memberPhone = decoded.phone;
             } catch (e) {
               console.warn("Could not decode phone from chat token.");
             }
          }

          // 2. ALWAYS create a unified BOOKING record for the Scheduling Engine
          const bookingId = crypto.randomUUID();
          const bookingSk = `BOOKING#${bookingId}#MEMBER#${memberPhone}`; 

          await ddb.send(new UpdateItemCommand({
            TableName: TABLE_NAME,
            Key: { pk: { S: adminSub }, sk: { S: bookingSk } },
            UpdateExpression:
              "SET entityType = :type, phone = :phone, packageId = :pkgId, #dateAttr = :date, startTime = :time, #statusAttr = :status, bookedAt = :ts, gsi1pk = :gsi1pk, gsi1sk = :gsi1sk, #typename = :typename",
            ExpressionAttributeNames: {
              "#dateAttr": "date",     
              "#statusAttr": "status",  
              "#typename": "__typename"
            },
            ExpressionAttributeValues: {
              ":type":     { S: "BOOKING" },
              ":phone":    { S: memberPhone },
              ":pkgId":    { S: payload.package_id || "UNKNOWN" },
              ":date":     { S: payload.date   || "" },
              ":time":     { S: payload.time   || "" },
              ":status":   { S: "PENDING_SCHEDULING" }, // Required by Timetable Agent
              ":ts":       { S: timestamp },
              ":gsi1pk":   { S: `${adminSub}#BOOKINGS` }, 
              ":gsi1sk":   { S: `STATUS#PENDING_SCHEDULING` }, // Required by Timetable Agent
              ":typename": { S: "ClubRecord" }
            },
          }));
          console.log(`✅ Unified Booking created for scheduling: ${bookingSk}`);

          // 3. If it originated from a Broadcast, update the receipt for campaign analytics
          if (broadcastId && memberPhone !== "UNKNOWN_PHONE") {
            const receiptSk = `BROADCAST#${broadcastId}#MEMBER#${memberPhone}`;
            await ddb.send(new UpdateItemCommand({
              TableName: TABLE_NAME,
              Key: { pk: { S: adminSub }, sk: { S: receiptSk } },
              UpdateExpression: "SET memberBookingStatus = :status, memberConfirmedAt = :ts, updatedAt = :ts",
              ExpressionAttributeValues: {
                ":status": { S: "BOOKED" },
                ":ts":     { S: timestamp },
              },
            }));
            console.log(`📝 Broadcast Receipt marked as BOOKED: ${receiptSk}`);
          }

        } catch (dbErr: any) {
          console.error(`❌ FINALIZE_SUBMISSION DynamoDB write failed: ${dbErr.message}`);
        }

        responseScreen = "Terminal_Success";
        responseData = {};
      }
      // ── 2. FETCH_PACKAGE_DETAILS ─────────────────────────────────────────────────
      else if (payload.action === "FETCH_PACKAGE_DETAILS" || (payload.package_id && !payload.date && !payload.time && !payload.action)) {
        // package_id may be "<broadcastId>|<catalogPackageId>" — split to get catalog id
        const parts       = (payload.package_id as string).split("|");
        const catalogId   = parts.length === 2 ? parts[1] : parts[0];
        const pkg      = await fetchPackageById(adminSub, catalogId);
        const validity = await fetchActiveBroadcastByPackageId(adminSub, catalogId);
        const today    = new Date().toISOString().split("T")[0];
        responseScreen = "Package_Details_Screen";
        responseData = {
          package_id:            catalogId,   // pass catalog ID downstream for booking
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
      // ── 3. PREPARE_VALIDATION / VALIDATE_BOOKING ─────────────────────────────────
      else if (payload.action === "PREPARE_VALIDATION" || payload.action === "VALIDATE_BOOKING" ||
               (payload.package_id && payload.date && payload.time && !payload.action)) {
        // PREPARE_VALIDATION: skip server-side validation, go directly to confirm screen
        // Date bounds are enforced by the DatePicker min-date/max-date on the client.
        if (payload.action === "PREPARE_VALIDATION" || !payload.action) {
          const pkg = await fetchPackageById(adminSub, payload.package_id);
          const pkgTitle = pkg?.packageType?.S || pkg?.name?.S || "Package";
          // Map time IDs to display labels
          const timeLabels: Record<string, string> = {
            "18:00": "6:00 PM", "19:00": "7:00 PM",
            "20:00": "8:00 PM", "21:00": "9:00 PM"
          };
          const timeDisplay = timeLabels[payload.time] ?? payload.time;
          // Compose summary server-side — avoids client-side variable interpolation issues
          const summary = `📋 *Package:* ${pkgTitle}\n📅 *Date:* ${payload.date}\n⏰ *Time:* ${timeDisplay}`;
          responseScreen = "Validation_Screen";
          responseData = {
            package_id: payload.package_id,
            date:       payload.date,
            time:       payload.time,
            summary,
          };
        } else {
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
      }
      // ── 4. Unknown action fallback ───────────────────────────────────────────────
      else {
        // Unknown action — log it so we can diagnose unexpected payloads
        console.error(`❌ Unknown data_exchange action: ${payload?.action}. Full payload:`, JSON.stringify(payload));
        // Return the packages screen as a safe fallback so the user isn't stuck
        const activePackages = await fetchActivePackages(adminSub, broadcastId);
        responseScreen = "Packages_Screen";
        responseData = { packages_list: activePackages };
      }
    }

    return {
      statusCode: 200,
      body: encryptMetaResponse({ screen: responseScreen, data: responseData }, aesKey, iv)
    };

  } catch (err: any) {
    console.error("❌ Flow execution error:", {
      message: err.message,
      stack:   err.stack,
      action:  decryptedAction ?? "UNKNOWN (decryption failed)",
      encryptedFieldsPresent: body ? Object.keys(body) : [],
    });
    return { statusCode: 500, body: "Internal Server Error" };
  }
};