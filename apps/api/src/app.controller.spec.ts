import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("getInfo", () => {
    it("deve retornar o nome e a versão da API", () => {
      expect(appController.getInfo()).toEqual({
        name: "LogiSense API",
        version: "0.1.0",
      });
    });
  });
});
