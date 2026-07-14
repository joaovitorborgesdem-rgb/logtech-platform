import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: "LogiSense API",
      version: "0.1.0",
    };
  }
}
