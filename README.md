# Ordem de Compra - Tiny API Integration

This project demonstrates how to integrate with Tiny's purchase order API using OAuth2.

## Setup

1. Create a `.env` file with the following variables:
```
CLIENT_ID=<your_tiny_client_id>
CLIENT_SECRET=<your_tiny_client_secret>
REDIRECT_URI=<your_app_callback_url>
```

2. Install dependencies:
```
npm install
```

3. Run the app:
```
npm start
```

## Routes

- `/auth` - Redirects to Tiny's OAuth2 authorization page.
- `/callback` - Callback endpoint to exchange the authorization code for an access token.
- `/enviar-oc` - Sends the purchase order to Tiny using the stored access token.
