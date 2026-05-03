# British Auction RFQ System

A simplified RFQ application with British Auction bidding rules, automatic close-time extension, forced close capping, supplier ranking, and realtime auction updates.

## Tech Stack

- Backend: Node.js, Express
- ORM: Prisma
- Database: Neon Postgres
- Realtime: Socket.io
- Frontend: React + Vite served by Express in production
- Hosting target: Render

## Project Structure

```text
backend/
  prisma/schema.prisma
  src/
    index.js
    routes/rfqs.js
    services/auctionService.js
frontend/
  index.html
  src/main.jsx
  src/styles.css
docs/
  hld.md
  schema-design.md
```

## Local Setup

```bash
npm install --prefix backend
npm install --prefix frontend
cp backend/.env.example backend/.env
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm run seed
npm run build
npm test
npm run dev
```

Open `http://localhost:4000` for the backend-served production build. For frontend development, run `npm run dev:frontend` and open `http://localhost:5173`.

`npm run seed` creates three demo auctions: active, scheduled, and force closed.

## Render Deployment

The repository includes `render.yaml` for a Render web service.

1. Create a Render Blueprint from this repository.
2. Add `DATABASE_URL` from Neon in Render environment variables.
3. Set `CORS_ORIGIN` to the deployed Render URL.
4. Render runs `prisma migrate deploy` before starting the Express server.

## Environment Variables

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
PORT=4000
CORS_ORIGIN=http://localhost:4000
```

## API Summary

- `GET /api/health`
- `GET /api/rfqs`
- `POST /api/rfqs`
- `GET /api/rfqs/:id`
- `POST /api/rfqs/:id/bids`

## Deliverables

- HLD: [docs/hld.md](docs/hld.md)
- Schema Design: [docs/schema-design.md](docs/schema-design.md)
- Backend Code: [backend](backend)
- Frontend Code: [frontend](frontend)
