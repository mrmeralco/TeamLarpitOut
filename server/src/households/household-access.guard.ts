import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/session.guard.js";
import { HouseholdsService } from "./households.service.js";
import type { Household } from "../domain/household.js";

export interface HouseholdRequest extends AuthenticatedRequest { household: Household }

/** Must run after SessionGuard; checks current source membership on every request. */
@Injectable()
export class HouseholdAccessGuard implements CanActivate {
  constructor(private readonly households: HouseholdsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HouseholdRequest>();
    request.household = await this.households.requireAccess(request.auth.ownerId, request.params.sin as string);
    return true;
  }
}
