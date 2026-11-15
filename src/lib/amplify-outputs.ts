// AUTO-GENERATED — do not edit.
// Source: amplify_outputs.json  |  Regenerate: node scripts/copy-amplify-outputs.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const amplifyOutputs: any = {
  "auth": {
    "user_pool_id": "us-east-1_CP5uXuHm8",
    "aws_region": "us-east-1",
    "user_pool_client_id": "2q3inpqe1mkf70brl6bd90oise",
    "identity_pool_id": "us-east-1:ef355ac2-bfff-4b26-9d4b-c349479602b4",
    "mfa_methods": [],
    "standard_required_attributes": [
      "email"
    ],
    "username_attributes": [
      "email"
    ],
    "user_verification_types": [
      "email"
    ],
    "groups": [
      {
        "Admins": {
          "precedence": 0
        }
      },
      {
        "coach": {
          "precedence": 1
        }
      }
    ],
    "mfa_configuration": "NONE",
    "password_policy": {
      "min_length": 8,
      "require_lowercase": true,
      "require_numbers": true,
      "require_symbols": true,
      "require_uppercase": true
    },
    "unauthenticated_identities_enabled": true
  },
  "data": {
    "url": "https://glxfvrwxjfbb5o6qygzihfjjgi.appsync-api.us-east-1.amazonaws.com/graphql",
    "aws_region": "us-east-1",
    "default_authorization_type": "AMAZON_COGNITO_USER_POOLS",
    "authorization_types": [
      "AWS_IAM"
    ],
    "model_introspection": {
      "version": 1,
      "models": {
        "ClubRecord": {
          "name": "ClubRecord",
          "fields": {
            "pk": {
              "name": "pk",
              "isArray": false,
              "type": "String",
              "isRequired": true,
              "attributes": []
            },
            "sk": {
              "name": "sk",
              "isArray": false,
              "type": "String",
              "isRequired": true,
              "attributes": []
            },
            "gsi1pk": {
              "name": "gsi1pk",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "gsi1sk": {
              "name": "gsi1sk",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "gsi2pk": {
              "name": "gsi2pk",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "gsi2sk": {
              "name": "gsi2sk",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "entityType": {
              "name": "entityType",
              "isArray": false,
              "type": {
                "enum": "ClubRecordEntityType"
              },
              "isRequired": false,
              "attributes": []
            },
            "phone": {
              "name": "phone",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "name": {
              "name": "name",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "email": {
              "name": "email",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "status": {
              "name": "status",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "tier": {
              "name": "tier",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "specialty": {
              "name": "specialty",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "authorizedPackages": {
              "name": "authorizedPackages",
              "isArray": true,
              "type": "String",
              "isRequired": false,
              "attributes": [],
              "isArrayNullable": true
            },
            "bio": {
              "name": "bio",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "date": {
              "name": "date",
              "isArray": false,
              "type": "AWSDate",
              "isRequired": false,
              "attributes": []
            },
            "startTime": {
              "name": "startTime",
              "isArray": false,
              "type": "AWSTime",
              "isRequired": false,
              "attributes": []
            },
            "endTime": {
              "name": "endTime",
              "isArray": false,
              "type": "AWSTime",
              "isRequired": false,
              "attributes": []
            },
            "endDateTime": {
              "name": "endDateTime",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": []
            },
            "startDateTime": {
              "name": "startDateTime",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": []
            },
            "reason": {
              "name": "reason",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "facilityId": {
              "name": "facilityId",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "activityType": {
              "name": "activityType",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "capacity": {
              "name": "capacity",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "currentOccupancy": {
              "name": "currentOccupancy",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "coachPhone": {
              "name": "coachPhone",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "scheduleId": {
              "name": "scheduleId",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "bookedAt": {
              "name": "bookedAt",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": []
            },
            "packageId": {
              "name": "packageId",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "notes": {
              "name": "notes",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "packageType": {
              "name": "packageType",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "totalCredits": {
              "name": "totalCredits",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "remainingCredits": {
              "name": "remainingCredits",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "price": {
              "name": "price",
              "isArray": false,
              "type": "Float",
              "isRequired": false,
              "attributes": []
            },
            "validFrom": {
              "name": "validFrom",
              "isArray": false,
              "type": "AWSDate",
              "isRequired": false,
              "attributes": []
            },
            "validUntil": {
              "name": "validUntil",
              "isArray": false,
              "type": "AWSDate",
              "isRequired": false,
              "attributes": []
            },
            "whatsappMessageId": {
              "name": "whatsappMessageId",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "isRead": {
              "name": "isRead",
              "isArray": false,
              "type": "Boolean",
              "isRequired": false,
              "attributes": []
            },
            "hasReplied": {
              "name": "hasReplied",
              "isArray": false,
              "type": "Boolean",
              "isRequired": false,
              "attributes": []
            },
            "chatAnalysis": {
              "name": "chatAnalysis",
              "isArray": false,
              "type": "AWSJSON",
              "isRequired": false,
              "attributes": []
            },
            "deliveryStatus": {
              "name": "deliveryStatus",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "lastInteractionAt": {
              "name": "lastInteractionAt",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": []
            },
            "broadcastStatus": {
              "name": "broadcastStatus",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "launchDateTime": {
              "name": "launchDateTime",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": []
            },
            "packageRef": {
              "name": "packageRef",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "campaignKnowledgeBase": {
              "name": "campaignKnowledgeBase",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "targetingOptions": {
              "name": "targetingOptions",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "broadcastType": {
              "name": "broadcastType",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "promotionalContent": {
              "name": "promotionalContent",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "targetMemberCount": {
              "name": "targetMemberCount",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "sentCount": {
              "name": "sentCount",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "packageKnowledgeBase": {
              "name": "packageKnowledgeBase",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "location": {
              "name": "location",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "description": {
              "name": "description",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "creditsConsumed": {
              "name": "creditsConsumed",
              "isArray": false,
              "type": "Int",
              "isRequired": false,
              "attributes": []
            },
            "themeColor": {
              "name": "themeColor",
              "isArray": false,
              "type": "String",
              "isRequired": false,
              "attributes": []
            },
            "createdAt": {
              "name": "createdAt",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": [],
              "isReadOnly": true
            },
            "updatedAt": {
              "name": "updatedAt",
              "isArray": false,
              "type": "AWSDateTime",
              "isRequired": false,
              "attributes": [],
              "isReadOnly": true
            }
          },
          "syncable": true,
          "pluralName": "ClubRecords",
          "attributes": [
            {
              "type": "model",
              "properties": {}
            },
            {
              "type": "key",
              "properties": {
                "fields": [
                  "pk",
                  "sk"
                ]
              }
            },
            {
              "type": "key",
              "properties": {
                "name": "clubRecordsByGsi1pkAndGsi1sk",
                "queryField": "listByGsi1",
                "fields": [
                  "gsi1pk",
                  "gsi1sk"
                ]
              }
            },
            {
              "type": "key",
              "properties": {
                "name": "clubRecordsByGsi2pkAndGsi2sk",
                "queryField": "listByGsi2",
                "fields": [
                  "gsi2pk",
                  "gsi2sk"
                ]
              }
            },
            {
              "type": "auth",
              "properties": {
                "rules": [
                  {
                    "groupClaim": "cognito:groups",
                    "provider": "userPools",
                    "allow": "groups",
                    "groups": [
                      "Admins"
                    ],
                    "operations": [
                      "create",
                      "update",
                      "delete",
                      "read"
                    ]
                  },
                  {
                    "groupClaim": "cognito:groups",
                    "provider": "userPools",
                    "allow": "groups",
                    "operations": [
                      "read",
                      "update"
                    ],
                    "groups": [
                      "coach"
                    ]
                  }
                ]
              }
            }
          ],
          "primaryKeyInfo": {
            "isCustomPrimaryKey": true,
            "primaryKeyFieldName": "pk",
            "sortKeyFieldNames": [
              "sk"
            ]
          }
        }
      },
      "enums": {
        "ClubRecordEntityType": {
          "name": "ClubRecordEntityType",
          "values": [
            "MEMBER",
            "COACH",
            "SCHEDULE",
            "BOOKING",
            "PACKAGE",
            "CLAIM",
            "FACILITY",
            "CATALOG",
            "BROADCAST",
            "BROADCAST_RECEIPT",
            "PROFILE",
            "COACH_UNAVAILABILITY"
          ]
        }
      },
      "nonModels": {},
      "mutations": {
        "generateTimetable": {
          "name": "generateTimetable",
          "isArray": false,
          "type": "AWSJSON",
          "isRequired": false,
          "arguments": {
            "adminSub": {
              "name": "adminSub",
              "isArray": false,
              "type": "String",
              "isRequired": true
            }
          }
        },
        "dispatchBroadcast": {
          "name": "dispatchBroadcast",
          "isArray": false,
          "type": "AWSJSON",
          "isRequired": false,
          "arguments": {
            "adminSub": {
              "name": "adminSub",
              "isArray": false,
              "type": "String",
              "isRequired": true
            },
            "templateName": {
              "name": "templateName",
              "isArray": false,
              "type": "String",
              "isRequired": true
            },
            "broadcastType": {
              "name": "broadcastType",
              "isArray": false,
              "type": "String",
              "isRequired": true
            },
            "promotionalContent": {
              "name": "promotionalContent",
              "isArray": false,
              "type": "String",
              "isRequired": true
            },
            "targetingOptions": {
              "name": "targetingOptions",
              "isArray": false,
              "type": "String",
              "isRequired": false
            },
            "packageIntent": {
              "name": "packageIntent",
              "isArray": false,
              "type": "String",
              "isRequired": false
            },
            "campaignId": {
              "name": "campaignId",
              "isArray": false,
              "type": "String",
              "isRequired": false
            }
          }
        }
      }
    }
  },
  "version": "1.5",
  "custom": {
    "VidaBaileFlowUrl": "https://jrq4tiwdfuywjjfgogsvsqebcy0ivmfh.lambda-url.us-east-1.on.aws/"
  }
};

export default amplifyOutputs;