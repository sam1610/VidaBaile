import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import * as crypto from "crypto";

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
// In production, fetch this from AWS Systems Manager Parameter Store or AWS Secrets Manager
const PRIVATE_KEY = process.env.FLOW_PRIVATE_KEY!; 

// ────────────────────────────────────────────────────────────────────────────
// 1. Meta Flows Cryptography Engine
// ────────────────────────────────────────────────────────────────────────────
function decryptMetaRequest(body: any, privateKey: string) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  // Decrypt AES key with RSA-OAEP-SHA256
  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(encrypted_aes_key, "base64")
  );

  const iv = Buffer.from(initial_vector, "base64");
  const flowBuffer = Buffer.from(encrypted_flow_data, "base64");
  const authTagOffset = flowBuffer.length - 16;

  // Decrypt payload with AES-128-GCM
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(flowBuffer.subarray(authTagOffset));
  const payload = Buffer.concat([
    decipher.update(flowBuffer.subarray(0, authTagOffset)), 
    decipher.final()
  ]);

  return { aesKey, iv, data: JSON.parse(payload.toString("utf8")) };
}

function encryptMetaResponse(responseData: any, aesKey: Buffer, originalIv: Buffer) {
  // Flip the IV (Bitwise NOT) required by Meta's spec
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
  // Queries GSI1 for all active catalog packages
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

// ────────────────────────────────────────────────────────────────────────────
// 3. Main Handler
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (event: any) => {
  console.log("🌊 Flow Endpoint Triggered");

  try {
    const body = JSON.parse(event.body);
    const { aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY);
    
    console.log("🔓 Decrypted payload action:", decryptedData.action);

    let responseScreen = "Main_Menu_Screen";
    let responseData: any = {};

    // ── ROUTING STATE MACHINE ─────────────────────────────────────────────
    
    if (decryptedData.action === "INIT" || decryptedData.action === "ping") {
      responseScreen = "Main_Menu_Screen";
      responseData = {
        greeting: "Welcome to La Vida Dance Club! How can we help you today?",
        service_options: [
          { id: "view_packages", title: "🎟️ Packages", description: "Browse and buy dance packages" },
          { id: "book_coach", title: "🕺 Coach Reservation", description: "Book a private session" },
          { id: "request_callback", title: "📞 Call Back", description: "Have us contact you" }
        ]
      };
    } 
    else if (decryptedData.action === "data_exchange") {
      const payload = decryptedData.data; // Custom payload from your Flow JSON
      
      if (payload.action === "ROUTE_FROM_MENU") {
        if (payload.selection === "view_packages") {
          responseScreen = "Packages_Screen";
          // Hardcoded adminSub for demo. In production, pass this via the Flow message launch or resolve dynamically.
          const adminSub = "8438c488-7081-70fc-4e23-656f4cdd7fb6"; 
          responseData = {
            packages_list: await fetchActivePackages(adminSub)
          };
        }
        // Add else if for book_coach and request_callback here
      }
      else if (payload.action === "FINALIZE_SUBMISSION") {
        // Write to DynamoDB logic goes here based on accumulated payload
        responseScreen = "Terminal_Success";
        responseData = {};
      }
    }

    // ── ENCRYPT AND RETURN ────────────────────────────────────────────────
    const flowResponse = {
      screen: responseScreen,
      data: responseData
    };

    const encryptedBody = encryptMetaResponse(flowResponse, aesKey, iv);

    return {
      statusCode: 200,
      body: encryptedBody
    };

  } catch (err: any) {
    console.error("❌ Flow execution error:", err);
    // Meta expects standard HTTP errors if decryption fails
    return { statusCode: 500, body: "Internal Server Error" };
  }
};