# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Environment configuration

Expo reads client-safe variables from `.env.development` during local
development and `.env.production` for production exports and builds.

Before creating a production build:

1. Replace the placeholder `EXPO_PUBLIC_API_URL` in `.env.production`
   with the deployed HTTPS FastAPI URL.
2. Set `EXPO_PUBLIC_EAS_PROJECT_ID` after linking the EAS project.
3. Set `GOOGLE_SERVICES_FILE` to the local or EAS file-secret path for
   `google-services.json` when Android push notifications are enabled.
4. Keep `GOOGLE_MAPS_API_KEY` only in the backend environment. The
   mobile app uses `/maps/*` endpoints and must not contain the server
   Maps key.
5. Review the `EXPO_PUBLIC_ENABLE_*` feature flags for the target
   environment.

All `EXPO_PUBLIC_*` values are embedded in the application bundle and
must be treated as public configuration, not secrets.

## Push notification setup

1. Install the native modules:

   ```bash
   npx expo install expo-notifications expo-device expo-secure-store expo-task-manager expo-crypto
   ```

2. Sign in and initialize or link the EAS project:

   ```bash
   npx eas-cli login
   npx eas-cli init
   ```

3. Set the resulting project UUID in `.env.development`,
   `.env.production`, and the corresponding EAS environment:

   ```bash
   EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
   ```

4. Create a Firebase Android app with package
   `com.travelallowance.mobile`. Download `google-services.json`, keep
   it outside Git, and set `GOOGLE_SERVICES_FILE` to its local path or
   EAS file-secret path.

5. Create a Firebase service-account key and upload it as the Android
   FCM V1 credential. The service-account JSON is secret and must never
   be committed.

   ```bash
   npx eas-cli credentials
   ```

6. Create and install a development build. Remote push notifications
   are not supported by Expo Go on current Android SDK versions.

   ```bash
   npx eas-cli build --profile development --platform android
   ```

7. Start Metro for the installed development build:

   ```bash
   npm run start -- --port 8081
   ```

8. Sign in and grant notification permission. Verify that the backend
   `push_tokens` table contains an active row for the signed-in user.

9. From the `backend` directory, send a test notification without
   exposing the Expo token:

   ```bash
   python scripts/send_test_notification.py --email therapist@example.com --type schedule_assigned --schedule-id 42
   ```

If Expo push security is enabled, configure `EXPO_ACCESS_TOKEN` only
in the backend environment.

The backend should send one of these data payloads with each Expo push
notification:

```json
{ "type": "schedule_assigned", "schedule_id": 42 }
```

```json
{ "type": "schedule_updated", "schedule_id": 42 }
```

```json
{ "type": "claim_approved", "claim_id": 18 }
```

```json
{ "type": "claim_rejected", "claim_id": 18 }
```

```json
{ "type": "workday_reminder" }
```

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
