// AUTO-GENERATED — do not edit.
// Source: amplify_outputs.json  |  Regenerate: node scripts/copy-amplify-outputs.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const amplifyOutputs: any = {
  "auth": {
    "user_pool_id": "us-east-1_iqEjRFnL4",
    "aws_region": "us-east-1",
    "user_pool_client_id": "s2dn5bekroma1se3ossokgtop",
    "identity_pool_id": "us-east-1:6df53c6f-125f-47e7-aa7e-f247e3c91a34",
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
    "url": "https://6igfjquy2rdcznfmtiasjl2ina.appsync-api.us-east-1.amazonaws.com/graphql",
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
            "currentOccupancy": {
              "name": "currentOccupancy",
              "isArray": false,
              "type": "Int",
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
            "CATALOG"
          ]
        }
      },
      "nonModels": {}
    }
  },
  "version": "1.5"
};

export default amplifyOutputs;