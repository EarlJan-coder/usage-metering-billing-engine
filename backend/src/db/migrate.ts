import { pathToFileURL } from "node:url";

import { migrate } from "./index.js";

const isCli =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await migrate(url);
  console.log("migrations applied");
}
