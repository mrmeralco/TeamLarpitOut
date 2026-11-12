import { Controller, Get } from "@nestjs/common";
import { catalogForClient } from "../domain/appliance-catalog.js";

/** The appliance survey's questions. Public: no Household data. */
@Controller("appliances")
export class ApplianceCatalogController {
  @Get("catalog")
  catalog() {
    return { appliances: catalogForClient() };
  }
}
