import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule, configureApp } from "./app.module.js";

const app = configureApp(await NestFactory.create(AppModule));
const port = Number(process.env.PORT ?? 8787);
await app.listen(port);
console.log(`KuryenteKo API on http://localhost:${port}`);
