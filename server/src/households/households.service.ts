import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { MyMeralcoSource } from "../bills/myMeralcoSource.js";
import { MY_MERALCO_SOURCE } from "../common/injection-tokens.js";

@Injectable()
export class HouseholdsService {
  constructor(@Inject(MY_MERALCO_SOURCE) private readonly meralco: MyMeralcoSource) {}

  list(ownerId: string) {
    return this.meralco.households(ownerId);
  }

  async requireAccess(ownerId: string, sin: string): Promise<void> {
    if (!(await this.list(ownerId)).some((household) => household.sin === sin)) {
      // Unknown and foreign services have the same response to avoid disclosing ownership.
      throw new NotFoundException({ error: "Hindi makita ang Household." });
    }
  }
}
