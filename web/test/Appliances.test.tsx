import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Appliances } from "../src/components/Appliances";
import type { Household } from "../src/api/client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const traditionalHousehold: Household = {
  sin: "1234567890",
  masked_address: "••• City A",
  meter_type: "traditional",
};

const catalog = {
  appliances: [
    {
      type: "aircon",
      label: "Aircon",
      routine: "timeRanges",
      questions: [
        { key: "mount", label: "Split or window type?", options: [{ value: "split", label: "Split" }] },
        { key: "inverter", label: "Does it say Inverter?", options: [{ value: "yes", label: "Yes" }] },
        { key: "room", label: "How big is the room?", options: [{ value: "medium", label: "Katamtaman" }] },
      ],
      defaultRating: 1.0,
    },
    {
      type: "refrigerator",
      label: "Refrigerator",
      routine: "alwaysOn",
      questions: [],
      defaultRating: 1.1,
    },
    {
      type: "wifi",
      label: "Wi-Fi router",
      routine: "alwaysOn",
      questions: [],
      defaultRating: 0.24,
    },
    {
      type: "lights",
      label: "Lights",
      routine: "timeRanges",
      questions: [],
      defaultRating: 0.05,
    },
    {
      type: "electric_fan",
      label: "Electric fan",
      routine: "timeRanges",
      questions: [],
      defaultRating: 0.06,
    },
  ],
};

function mockFetch(handler: (url: string, init?: RequestInit) => any) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const result = handler(url, init);
    return Promise.resolve({
      ok: result.status ? result.status >= 200 && result.status < 300 : true,
      status: result.status ?? 200,
      json: () => Promise.resolve(result.body ?? result),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("13 · Aircon hours from Bill History (traditional) - UI", () => {
  it("shows the proposal prompt when aircon is added to traditional household", async () => {
    let savedPayload: any = null;
    mockFetch((url, init) => {
      if (url === "/api/appliances/catalog") return catalog;
      if (url === "/api/households/1234567890/appliances" && (!init || init.method === "GET")) {
        return { saved: false, updatedAt: null, appliances: [] };
      }
      if (url.includes("/aircon-proposal")) {
        return {
          canPropose: true,
          hours: 8,
          coolingKwhPerDay: 8,
          airconKw: 1.0,
          prompt: "Your aircon seems to run about 8 hours a day. Is that right?",
          options: [
            { action: "confirm", label: "Yes", hours: 8 },
            { action: "longer", label: "Longer", hours: 10 },
            { action: "shorter", label: "Shorter", hours: 6 },
          ],
        };
      }
      if (url === "/api/households/1234567890/appliances" && init?.method === "PUT") {
        savedPayload = JSON.parse(init.body as string);
        return { saved: true, updatedAt: new Date().toISOString(), appliances: savedPayload.appliances };
      }
      if (url.includes("/breakdown")) {
        return {
          bill: { period: "2026-10", kwh: 200, billingDays: 30 },
          rows: [],
          totals: { kwh: 200, perKwhCharges: 2000, fixedCharges: 50 },
        };
      }
      return {};
    });

    render(
      <Appliances
        token="test-token"
        household={traditionalHousehold}
        onExpired={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Appliances at home")).toBeDefined();
    });

    // Add Aircon from dropdown
    const select = screen.getByLabelText("Add an appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // Verify the proposal prompt appears
    await waitFor(() => {
      expect(screen.getByText("Your aircon seems to run about 8 hours a day. Is that right?")).toBeDefined();
    });

    // Verify the buttons [Yes], [Longer], [Shorter]
    expect(screen.getByRole("button", { name: "Yes" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Longer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Shorter" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Change / enter the routine manually" })).toBeDefined();

    // Confirm proposal with [Yes]
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => {
      expect(screen.getByText(/Confirmed: 8 hours\/day/)).toBeDefined();
    });

    // Save appliances
    fireEvent.click(screen.getByRole("button", { name: "Save and see where it goes" }));

    await waitFor(() => {
      expect(savedPayload).not.toBeNull();
    });

    const savedAircon = savedPayload.appliances.find((a: any) => a.type === "aircon");
    expect(savedAircon).toBeDefined();
    expect(savedAircon.timeRanges).toEqual([{ start: "22:00", end: "06:00", days: "everyday" }]);
  });

  it("adjusts hours when clicking Longer or Shorter", async () => {
    mockFetch((url, init) => {
      if (url === "/api/appliances/catalog") return catalog;
      if (url === "/api/households/1234567890/appliances" && (!init || init.method === "GET")) {
        return { saved: false, updatedAt: null, appliances: [] };
      }
      if (url.includes("/aircon-proposal")) {
        return {
          canPropose: true,
          hours: 8,
          prompt: "Your aircon seems to run about 8 hours a day. Is that right?",
        };
      }
      return {};
    });

    render(
      <Appliances
        token="test-token"
        household={traditionalHousehold}
        onExpired={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Appliances at home")).toBeDefined();
    });

    const select = screen.getByLabelText("Add an appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Longer" })).toBeDefined();
    });

    // Click Longer
    fireEvent.click(screen.getByRole("button", { name: "Longer" }));

    await waitFor(() => {
      expect(screen.getByText(/Confirmed: 10 hours\/day/)).toBeDefined();
    });
  });

  it("falls back to manual routine question when user clicks manual link", async () => {
    mockFetch((url, init) => {
      if (url === "/api/appliances/catalog") return catalog;
      if (url === "/api/households/1234567890/appliances" && (!init || init.method === "GET")) {
        return { saved: false, updatedAt: null, appliances: [] };
      }
      if (url.includes("/aircon-proposal")) {
        return {
          canPropose: true,
          hours: 8,
          prompt: "Your aircon seems to run about 8 hours a day. Is that right?",
        };
      }
      return {};
    });

    render(
      <Appliances
        token="test-token"
        household={traditionalHousehold}
        onExpired={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Appliances at home")).toBeDefined();
    });

    const select = screen.getByLabelText("Add an appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Change / enter the routine manually" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Change / enter the routine manually" }));

    await waitFor(() => {
      expect(screen.getByText("Go back to the Bill History estimate")).toBeDefined();
      expect(screen.getAllByLabelText("Start").length).toBeGreaterThanOrEqual(1);
    });
  });
});
