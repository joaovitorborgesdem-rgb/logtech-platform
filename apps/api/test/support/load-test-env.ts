import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

const envTestLocalPath = resolve(__dirname, "../../.env.test.local");

if (existsSync(envTestLocalPath)) {
  config({ path: envTestLocalPath });
}
