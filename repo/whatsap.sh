curl -X POST "https://graph.facebook.com/v24.0/812378515295003/whatsapp_business_encryption" \
  -H "Authorization: Bearer EAALDKSmND6gBSfiGpLvLlhePATashcasexmaCF8tHwKaR5NZAxKNZCDjyBrWVpiS5hxtgki671JNHXP8dl5iiiGEkqu93gXNxQju2UyNlOgAFQXWjEhU6OJoNIlRGQZB1NlhEZAIOuMUCue2FERlHVTJqmy4ro6qkx0gLbEf1bpFZANxg1SO3UPEjlFFIpQZDZD" \
  --data-urlencode "business_public_key=$(cat public.pem)"


curl -i -X POST \
  https://graph.facebook.com/v25.0/812378515295003/messages \
  -H "Authorization: Bearer EAALDKSmND6gBSfiGpLvLlhePATashcasexmaCF8tHwKaR5NZAxKNZCDjyBrWVpiS5hxtgki671JNHXP8dl5iiiGEkqu93gXNxQju2UyNlOgAFQXWjEhU6OJoNIlRGQZB1NlhEZAIOuMUCue2FERlHVTJqmy4ro6qkx0gLbEf1bpFZANxg1SO3UPEjlFFIpQZDZD" \
  -H 'Content-Type: application/json' \
  -d '{ "messaging_product": "whatsapp", "to": "97333787388", "type": "template", "template": { "name": "hello_world", "language": { "code": "en_US" } } }'





  curl -X POST "https://graph.facebook.com/v24.0/812378515295003/messages" \
  -H "Authorization: Bearer EAALDKSmND6gBSfiGpLvLlhePATashcasexmaCF8tHwKaR5NZAxKNZCDjyBrWVpiS5hxtgki671JNHXP8dl5iiiGEkqu93gXNxQju2UyNlOgAFQXWjEhU6OJoNIlRGQZB1NlhEZAIOuMUCue2FERlHVTJqmy4ro6qkx0gLbEf1bpFZANxg1SO3UPEjlFFIpQZDZD" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "97333787388",
    "type": "template",
    "template": {
      "name": "promo_offer",
     "language": {
        "code": "en"
      },
      "components": [
        {
          "type": "body",
          "parameters": [
            {
              "type": "text",
              "text": "Samir"
            },
            {
              "type": "text",
              "text": "Enjoy 20% off our new class bundle!"
            }
          ]
        },
        {
          "type": "button",
          "sub_type": "flow",
          "index": "0"
        }
      ]
    }
  }'