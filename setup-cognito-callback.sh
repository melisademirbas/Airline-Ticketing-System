#!/bin/bash

# AWS Cognito Callback URL Setup Script
# This script sets up the callback URLs for AWS Cognito

USER_POOL_ID="eu-north-1_0IKa8ySfx"
CLIENT_ID="ahjf8dv8thoaasmg65gkenbtt"
CALLBACK_URL="http://localhost:3000"
LOGOUT_URL="http://localhost:3000"

echo "🔧 Setting up AWS Cognito callback URLs..."
echo "User Pool ID: $USER_POOL_ID"
echo "Client ID: $CLIENT_ID"
echo "Callback URL: $CALLBACK_URL"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed."
    echo "Please install AWS CLI first: https://aws.amazon.com/cli/"
    exit 1
fi

# Update App Client
aws cognito-idp update-user-pool-client \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --callback-urls "$CALLBACK_URL" \
  --logout-urls "$LOGOUT_URL" \
  --allowed-o-auth-flows "code" \
  --allowed-o-auth-scopes "openid" "email" "profile" \
  --allowed-o-auth-flows-user-pool-client \
  --region eu-north-1

if [ $? -eq 0 ]; then
    echo "✅ Callback URLs configured successfully!"
else
    echo "❌ Failed to configure callback URLs."
    echo "Please check your AWS credentials and permissions."
fi
