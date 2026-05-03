import { type Page, type APIRequestContext, expect } from "@playwright/test";

let counter = 0;
function uniqueId() {
  counter += 1;
  return `${Date.now()}_${process.pid}_${counter}`;
}

export interface TestAccount {
  username: string;
  password: string;
  userId: string;
  orgId: string;
  orgName: string;
}

export interface TestCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

async function jsonOrThrow(res: { ok: () => boolean; status: () => number; json: () => Promise<any>; text: () => Promise<string> }) {
  if (!res.ok()) {
    throw new Error(`API call failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function registerAccount(request: APIRequestContext): Promise<TestAccount> {
  const id = uniqueId();
  const username = `e2e_${id}`;
  const password = "Test12345!";
  const orgName = `E2E Org ${id}`;

  const regRes = await request.post("/api/auth/register", {
    data: { username, password, fullName: `E2E ${id}` },
  });
  const reg = await jsonOrThrow(regRes);

  const orgRes = await request.post("/api/orgs", {
    data: {
      name: orgName,
      phone: "555-0100",
      email: `${username}@example.com`,
      address: "123 Test St",
    },
  });
  const org = await jsonOrThrow(orgRes);

  return {
    username,
    password,
    userId: reg.user.id,
    orgId: org.id,
    orgName,
  };
}

export async function createCustomer(
  request: APIRequestContext,
  overrides: Partial<TestCustomer> = {}
): Promise<TestCustomer> {
  const id = uniqueId();
  const data = {
    name: overrides.name ?? `Acme ${id}`,
    email: overrides.email ?? `cust_${id}@example.com`,
    phone: overrides.phone ?? "555-0199",
    address: "1 Customer Way",
  };
  const res = await request.post("/api/customers", { data });
  const cust = await jsonOrThrow(res);
  return { id: cust.id, name: cust.name, email: cust.email, phone: cust.phone };
}

export async function createQuote(
  request: APIRequestContext,
  customerId: string,
  opts: { description?: string; qty?: number; unitPrice?: number } = {}
) {
  const res = await request.post("/api/quotes", {
    data: {
      customerId,
      taxRate: "0",
      discount: "0",
      notes: "E2E quote",
      items: [
        {
          description: opts.description ?? "Diagnostic Service",
          qty: String(opts.qty ?? 1),
          unitPrice: String(opts.unitPrice ?? 150),
        },
      ],
    },
  });
  return jsonOrThrow(res);
}

export async function createInvoice(
  request: APIRequestContext,
  customerId: string,
  opts: { description?: string; qty?: number; unitPrice?: number } = {}
) {
  const res = await request.post("/api/invoices", {
    data: {
      customerId,
      taxRate: "0",
      discount: "0",
      notes: "E2E invoice",
      items: [
        {
          description: opts.description ?? "Consulting Hours",
          qty: String(opts.qty ?? 2),
          unitPrice: String(opts.unitPrice ?? 100),
        },
      ],
    },
  });
  return jsonOrThrow(res);
}

/**
 * Suppress noisy non-fatal console errors that come from third-party
 * resources during e2e (e.g. blocked analytics, dev-only HMR warnings).
 */
export function quietExpectedConsoleNoise(page: Page) {
  page.on("pageerror", () => {
    /* swallow — assertions catch what matters */
  });
}

export async function expectVisible(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
}
