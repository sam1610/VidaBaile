import { DynamoDBClient, QueryCommand, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import * as crypto from "crypto";

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
// Removed the top-level PRIVATE_KEY declaration to prevent cold-start crashes

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
  const payload = Buffer.concat([
    decipher.update(flowBuffer.subarray(0, authTagOffset)), 
    decipher.final()
  ]);

  return { aesKey, iv, data: JSON.parse(payload.toString("utf8")) };
}

function encryptMetaResponse(responseData: any, aesKey: Buffer, originalIv: Buffer) {
  const flippedIv = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) flippedIv[i] = ~originalIv[i];

  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(responseData), "utf8")), 
    cipher.final()
  ]);
  
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Data Fetching Helpers
// ────────────────────────────────────────────────────────────────────────────
async function fetchActivePackages(adminSub: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "clubRecordsByGsi1pkAndGsi1sk",
    KeyConditionExpression: "gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)",
    ExpressionAttributeValues: {
      ":gsi1pk": { S: `${adminSub}#CATALOG` },
      ":prefix": { S: "STATUS#ACTIVE" }
    }
  }));
  
  return (res.Items || []).map(item => ({
    id: item.sk?.S?.replace("CATALOG#", "") || "",
    title: item.packageType?.S || "Package",
    description: `${item.price?.N || item.price?.S || "0"} BHD`
  }));
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

// ────────────────────────────────────────────────────────────────────────────
// 3. Main Handler
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (event: any) => {
  console.log("🌊 Flow Endpoint Triggered");

  try {
    // Safely load and sanitize the key INSIDE the execution context
    const rawKey = process.env.FLOW_PRIVATE_KEY || "";
    const PRIVATE_KEY = rawKey.replace(/\\n/g, '\n');

    if (!PRIVATE_KEY) {
      console.error("❌ CRITICAL: FLOW_PRIVATE_KEY is missing from environment variables.");
    }

    let bodyStr = event.body || "{}";
    if (event.isBase64Encoded) {
      bodyStr = Buffer.from(bodyStr, "base64").toString("utf8");
    }
    const body = JSON.parse(bodyStr);

    const { aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY);
    console.log("🔓 Decrypted payload action:", decryptedData.action);

    // ── 1. HEALTH CHECK PING ──────────────────────────────────────────────
    if (decryptedData.action === "ping") {
      console.log("🏓 Ping received, returning active status.");
      return {
        statusCode: 200,
        body: encryptMetaResponse({ data: { status: "active" } }, aesKey, iv)
      };
    }

    let responseScreen = "";
    let responseData: any = {};
    const adminSub = "8438c488-7081-70fc-4e23-656f4cdd7fb6"; // Demo Admin Sub

    // ── 2. ROUTING STATE MACHINE ──────────────────────────────────────────
    if (decryptedData.action === "INIT") {
      responseScreen = "Packages_Screen";
      responseData = {
        packages_list: await fetchActivePackages(adminSub)
      };
    } 
    else if (decryptedData.action === "data_exchange") {
      const payload = decryptedData.data; 
      
      // -- A. Package Selection --
      if (payload.action === "FETCH_PACKAGE_DETAILS") {
        const pkg = await fetchPackageById(adminSub, payload.package_id);
        responseScreen = "Package_Details_Screen";
        responseData = {
          package_title: pkg?.packageType?.S || "Unknown Package",
          package_description: `Price: ${pkg?.price?.N || "0"} BHD. Includes exclusive sessions.`,
          package_image_url: "https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=600&auto=format&fit=crop", // Add a real S3 URL here later
          is_time_error_visible: false,
          time_error_msg: ""
        };
      }
      // -- B. Time/Date Validation --
      else if (payload.action === "VALIDATE_BOOKING") {
        const selectedDate = new Date(`${payload.date}T${payload.time}:00`);
        const now = new Date();

        // Validation Logic: Date cannot be in the past
        if (selectedDate < now) {
          responseScreen = "Package_Details_Screen";
          responseData = {
            // Re-populate the screen data so it doesn't crash
            package_title: "Selected Package", 
            package_description: "Please select a valid time.",
            package_image_url: "https://images.unsplash.com/photo-1547153760-18fc86324498?q=80&w=600&auto=format&fit=crop",
            // Trigger the red error text we added to the JSON
            is_time_error_visible: true,
            time_error_msg: "The selected time has already passed. Please choose a future slot."
          };
        } else {
          // Validation passed! Move to confirmation screen.
          responseScreen = "Validation_Screen";
          responseData = {
            summary_text: `You are requesting a booking for ${payload.date} at ${payload.time}.`
          };
        }
      }
      // -- C. Final Submission --
      else if (payload.action === "FINALIZE_SUBMISSION") {
        const bookingId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        await ddb.send(new PutItemCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: { S: adminSub }, 
            sk: { S: `BOOKING#${bookingId}` },
            gsi1pk: { S: `${adminSub}#BOOKINGS` }, 
            gsi1sk: { S: `STATUS#CONFIRMED#${timestamp}` },
            entityType: { S: "BOOKING" },
            packageId: { S: payload.package_id || "UNKNOWN" },
            bookingDate: { S: payload.date || "UNKNOWN" },
            bookingTime: { S: payload.time || "UNKNOWN" },
            createdAt: { S: timestamp }
          }
        }));

        responseScreen = "Terminal_Success";
        responseData = {};
      }
    }

    // ── 3. ENCRYPT AND RETURN UI PAYLOAD ──────────────────────────────────
    return {
      statusCode: 200,
      body: encryptMetaResponse({ screen: responseScreen, data: responseData }, aesKey, iv)
    };

  } catch (err: any) {
    console.error("❌ Flow execution error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};