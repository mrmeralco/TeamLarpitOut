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
        { key: "mount", label: "Split o window type?", options: [{ value: "split", label: "Split" }] },
        { key: "inverter", label: "May nakasulat bang Inverter?", options: [{ value: "yes", label: "Oo" }] },
        { key: "room", label: "Gaano kalaki ang kwarto?", options: [{ value: "medium", label: "Katamtaman" }] },
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
      label: "Mga ilaw",
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
          prompt: "Mukhang mga 8 oras/araw bukas ang aircon mo. Tama ba?",
          options: [
            { action: "confirm", label: "Oo", hours: 8 },
            { action: "longer", label: "Mas matagal", hours: 10 },
            { action: "shorter", label: "Mas maikli", hours: 6 },
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
      expect(screen.getByText("Mga appliance sa bahay")).toBeDefined();
    });

    // Add Aircon from dropdown
    const select = screen.getByLabelText("Magdagdag ng appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Idagdag" }));

    // Verify the proposal prompt appears
    await waitFor(() => {
      expect(screen.getByText("Mukhang mga 8 oras/araw bukas ang aircon mo. Tama ba?")).toBeDefined();
    });

    // Verify the buttons [Oo], [Mas matagal], [Mas maikli]
    expect(screen.getByRole("button", { name: "Oo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Mas matagal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Mas maikli" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Ibahin / manu-manong ilagay ang routine" })).toBeDefined();

    // Confirm proposal with [Oo]
    fireEvent.click(screen.getByRole("button", { name: "Oo" }));

    await waitFor(() => {
      expect(screen.getByText(/Kinumpirma: 8 oras\/araw/)).toBeDefined();
    });

    // Save appliances
    fireEvent.click(screen.getByRole("button", { name: "I-save at tingnan kung saan napupunta" }));

    await waitFor(() => {
      expect(savedPayload).not.toBeNull();
    });

    const savedAircon = savedPayload.appliances.find((a: any) => a.type === "aircon");
    expect(savedAircon).toBeDefined();
    expect(savedAircon.timeRanges).toEqual([{ start: "22:00", end: "06:00", days: "everyday" }]);
  });

  it("adjusts hours when clicking Mas matagal or Mas maikli", async () => {
    mockFetch((url, init) => {
      if (url === "/api/appliances/catalog") return catalog;
      if (url === "/api/households/1234567890/appliances" && (!init || init.method === "GET")) {
        return { saved: false, updatedAt: null, appliances: [] };
      }
      if (url.includes("/aircon-proposal")) {
        return {
          canPropose: true,
          hours: 8,
          prompt: "Mukhang mga 8 oras/araw bukas ang aircon mo. Tama ba?",
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
      expect(screen.getByText("Mga appliance sa bahay")).toBeDefined();
    });

    const select = screen.getByLabelText("Magdagdag ng appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Idagdag" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mas matagal" })).toBeDefined();
    });

    // Click Mas matagal
    fireEvent.click(screen.getByRole("button", { name: "Mas matagal" }));

    await waitFor(() => {
      expect(screen.getByText(/Kinumpirma: 10 oras\/araw/)).toBeDefined();
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
          prompt: "Mukhang mga 8 oras/araw bukas ang aircon mo. Tama ba?",
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
      expect(screen.getByText("Mga appliance sa bahay")).toBeDefined();
    });

    const select = screen.getByLabelText("Magdagdag ng appliance");
    fireEvent.change(select, { target: { value: "aircon" } });
    fireEvent.click(screen.getByRole("button", { name: "Idagdag" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ibahin / manu-manong ilagay ang routine" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ibahin / manu-manong ilagay ang routine" }));

    await waitFor(() => {
      expect(screen.getByText("Bumalik sa tantya mula sa Bill History")).toBeDefined();
      expect(screen.getAllByLabelText("Simula").length).toBeGreaterThanOrEqual(1);
    });
  });
});
