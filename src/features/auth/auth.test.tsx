import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, tauri } from "@/test/harness";
import { AuthGate } from "./AuthGate";

vi.mock("@tauri-apps/api/core", async () => (await import("@/test/harness")).tauri.core);
// AuthGate awaits getDb() (to let migrations run) before checking has_any_users —
// mock it out here the same way integration.test.tsx does, so that check
// doesn't hit the real @tauri-apps/plugin-sql module, which has no Tauri
// backend to talk to in jsdom.
vi.mock("@/lib/db", async () => (await import("@/test/harness")).db.module);

beforeEach(() => {
  tauri.reset();
});

function AppStub() {
  return <div>APP CONTENT</div>;
}

describe("AuthGate", () => {
  it("goes straight to the app when a session is already active", async () => {
    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: { id: 1, username: "amina", role: "admin" } },
    );
    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
    // never needed to ask whether any account exists
    expect(tauri.core.invoke).not.toHaveBeenCalledWith("has_any_users");
  });

  it("shows first-run setup when no account exists yet", async () => {
    tauri.onInvoke("has_any_users", () => false);
    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );
    expect(await screen.findByRole("button", { name: /create admin account/i })).toBeInTheDocument();
  });

  it("shows the login screen when an account already exists", async () => {
    tauri.onInvoke("has_any_users", () => true);
    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );
    expect(await screen.findByRole("button", { name: /^log in$/i })).toBeInTheDocument();
  });
});

describe("SetupScreen", () => {
  beforeEach(() => {
    tauri.onInvoke("has_any_users", () => false);
  });

  it("creates the first admin, shows a recovery code once, then enters the app", async () => {
    tauri.onInvoke("create_first_admin", () => "K7QX-9F2M-3RTL");
    tauri.onInvoke("verify_login", () => ({ id: 1, username: "admin", role: "admin" }));

    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );

    await userEvent.clear(await screen.findByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.type(screen.getByLabelText("Confirm password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /create admin account/i }));

    expect(await screen.findByText("K7QX-9F2M-3RTL")).toBeInTheDocument();
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(continueBtn).toBeEnabled();
    await userEvent.click(continueBtn);

    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("rejects mismatched passwords without calling the backend", async () => {
    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );

    await userEvent.type(await screen.findByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: /create admin account/i }));

    await waitFor(() =>
      expect(tauri.core.invoke).not.toHaveBeenCalledWith("create_first_admin", expect.anything()),
    );
  });
});

describe("LoginScreen", () => {
  beforeEach(() => {
    tauri.onInvoke("has_any_users", () => true);
  });

  it("logs in with correct credentials", async () => {
    tauri.onInvoke("verify_login", (args) => {
      const { username, password } = args as { username: string; password: string };
      if (username === "amina" && password === "secret1") {
        return { id: 2, username: "amina", role: "teacher" };
      }
      throw "Incorrect username or password.";
    });

    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );

    await userEvent.type(await screen.findByLabelText("Username"), "amina");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("stays on the login screen with the wrong password", async () => {
    tauri.onInvoke("verify_login", () => {
      throw "Incorrect username or password.";
    });

    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );

    await userEvent.type(await screen.findByLabelText("Username"), "amina");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(tauri.core.invoke).toHaveBeenCalledWith("verify_login", expect.anything()));
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });

  it("resets a forgotten password with a recovery code and issues a new one", async () => {
    tauri.onInvoke("reset_password_with_recovery_code", () => "NEW1-CODE-HERE");

    renderWithProviders(
      <AuthGate>
        <AppStub />
      </AuthGate>,
      { authUser: null },
    );

    await userEvent.click(await screen.findByText(/forgot your password/i));
    await userEvent.type(screen.getByLabelText("Username"), "amina");
    await userEvent.type(screen.getByLabelText("Recovery code"), "K7QX-9F2M-3RTL");
    await userEvent.type(screen.getByLabelText("New password"), "newsecret");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "newsecret");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText("NEW1-CODE-HERE")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /back to login/i }));
    expect(await screen.findByRole("button", { name: /^log in$/i })).toBeInTheDocument();
  });
});
