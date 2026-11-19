# BookIt

Multi-platform booking and multi-vendor marketplace platform (**Next.js** web app + **Expo React Native** mobile app + shared workspace packages).

## Prerequisites
- **Node.js >= 20** (npm 10+)
- Optional for mobile device preview: **Expo Go** on iOS/Android, Android Emulator, or iOS Simulator

## Quick Start

1. **Install dependencies** from the repository root:
   ```bash
   npm install
   ```

2. **Environment variables (optional)**
   Both apps run out of the box in frontend mock mode (`USE_MOCKS=true`) without creating any `.env` file. See `.env.example` for optional overrides (`NEXT_PUBLIC_BOOKIT_*` and `EXPO_PUBLIC_BOOKIT_*`).

3. **Run the Web App (Next.js on port 3000)**
   ```bash
   npm run dev:web
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. **Run the Mobile App (Expo / React Native)**
   Run from the root with the workspace script (or inside `apps/mobile`, **not** `npx expo start` directly in the root directory):
   ```bash
   npm run dev:mobile
   ```
   Or:
   ```bash
   cd apps/mobile
   npx expo start
   ```

5. **Verify Builds & Types**
   ```bash
   npm run typecheck
   npm run build
   npm run smoke
   ```

## Demo Accounts (Password: `Demo1234!`)
- **Customer**: `customer@bookit.demo`
- **Business Owner**: `business@bookit.demo`
- **Employee / Receptionist**: `employee@bookit.demo`
- **Platform Admin**: `admin@bookit.demo`
