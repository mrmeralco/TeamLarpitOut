import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";

// GEMINI_API_KEY etc. from server/.env (see .env.example). Providers read env at startup.
if (existsSync(".env")) process.loadEnvFile(".env");

const app = configureApp(await NestFactory.create(AppModule));
const port = Number(process.env.PORT ?? 8787);
await app.listen(port);
console.log(`KuryenteKo API on http://localhost:${port}`);
