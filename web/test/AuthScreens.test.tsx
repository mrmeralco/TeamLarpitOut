import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AuthFlow, CreatePassword } from "../src/components/auth/AuthScreens";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TOKEN = "t".repeat(43);
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
const body = (url: string) => JSON.parse(String(fetchMock.mock.calls.find(([u]) => u === url)![1]!.body));

beforeEach(() => {
  window.location.hash = "";
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const sent = init?.body ? JSON.parse(String(init.body)) : {};
    if (input === "/api/auth/signup") return response({ channel: "sms", sentTo: "+63 917 ••• 4567", expiresInSeconds: 600 }, 202);
    if (input === "/api/auth/signup/resend") return response({ channel: sent.channel, sentTo: sent.channel === "email" ? "r••a@gmail.com" : "+63 917 ••• 4567", expiresInSeconds: 600 }, 202);
    if (input === "/api/auth/signup/verify") return sent.code === "123456"
      ? response({ sentTo: "rosa@gmail.com", expiresInHours: 24, demoLink: `/#/create-password/${TOKEN}` })
      : response({ error: "The code is wrong or expired. Ask for a new code." }, 401);
    if (input === "/api/auth/signup/link") return sent.token === TOKEN ? response({ email: "rosa@gmail.com" }) : response({ error: "This link has expired.", reason: "expiredLink" }, 410);
    if (input === "/api/auth/signup/password") return response({ token: "new-session" });
    if (input === "/api/auth/signin") return response({ token: "session" });
    throw new Error(`Unexpected ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function signUp() {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "rosa@gmail.com" } });
  fireEvent.change(screen.getByLabelText("Contact number"), { target: { value: "917 123 4567" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByRole("heading", { name: "Enter the code we sent" });
}

describe("Sign up (mockup screens 1–3)", () => {
  it("asks only email + contact number and sends the code by SMS", async () => {
    render(<AuthFlow initial="signup" onSignedIn={() => {}} />);
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(true);
    await signUp();
    expect(body("/api/auth/signup")).toEqual({ email: "rosa@gmail.com", phone: "+639171234567" });
    expect(screen.getByText("+63 917 ••• 4567")).toBeTruthy();
    expect(screen.getByText(/Resend code in 2:00/)).toBeTruthy();
  });

  it("the six boxes accept a pasted code; a wrong code shows the error; the right one goes to Verify your email", async () => {
    render(<AuthFlow initial="signup" onSignedIn={() => {}} />);
    await signUp();
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("The code is wrong or expired. Ask for a new code.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "" } });
    for (let i = 1; i <= 6; i++) fireEvent.change(screen.getByLabelText(`Digit ${i}`), { target: { value: String(i) } });
    expect((screen.getByLabelText("Digit 6") as HTMLInputElement).value).toBe("6");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeTruthy();
    expect(screen.getByText("rosa@gmail.com")).toBeTruthy();
    expect(screen.getByText("Mobile number verified")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open Gmail/ }).getAttribute("href")).toBe(`/#/create-password/${TOKEN}`);
  });

  it("can send the code by email instead", async () => {
    render(<AuthFlow initial="signup" onSignedIn={() => {}} />);
    await signUp();
    fireEvent.click(screen.getByRole("button", { name: /Send the code by email instead/ }));
    expect(await screen.findByText("r••a@gmail.com")).toBeTruthy();
    expect(body("/api/auth/signup/resend")).toEqual({ email: "rosa@gmail.com", channel: "email" });
    expect(screen.queryByRole("button", { name: /Send the code by email instead/ })).toBeNull();
  });

  it("switches between Sign up and Sign in", () => {
    render(<AuthFlow initial="signup" onSignedIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(window.location.hash).toBe("#/signin");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
  });
});

describe("Create password (mockup screen 4)", () => {
  it("shows the email from the link, checks the rules, and signs in", async () => {
    const onDone = vi.fn();
    render(<CreatePassword token={TOKEN} onDone={onDone} onBack={() => {}} />);
    expect(await screen.findByText("rosa@gmail.com")).toBeTruthy();
    expect(screen.getByText("Email verified")).toBeTruthy();
    const create = () => screen.getByRole("button", { name: "Create password" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "rosa2026x" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "rosa2026" } });
    expect(create().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "rosa2026x" } });
    expect(create().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
    fireEvent.click(create());
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("new-session"));
    expect(body("/api/auth/signup/password")).toEqual({ token: TOKEN, password: "rosa2026x" });
  });

  it("an expired link says so", async () => {
    render(<CreatePassword token={"x".repeat(43)} onDone={() => {}} onBack={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Link not valid" })).toBeTruthy();
    expect(screen.getByText("This link has expired.")).toBeTruthy();
  });
});

describe("Sign in", () => {
  it("signs in with Gmail address + password", async () => {
    const onSignedIn = vi.fn();
    render(<AuthFlow initial="signin" onSignedIn={onSignedIn} notice="Your session expired. Please sign in again." />);
    expect(screen.getByText("Your session expired. Please sign in again.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gmail address"), { target: { value: "rosa@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "rosa2026x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith("session"));
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
  });
});
