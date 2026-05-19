import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/api/portal/:token", async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    if (!token || token.length < 8) return res.status(404).send("Not found");

    const customer = await storage.getCustomerByPortalToken(token);
    if (!customer) return res.status(404).send("Not found");

    const org = await storage.getOrg(customer.orgId);
    if (!org) return res.status(404).send("Not found");

    // Portal is a public endpoint (token-based) so there's no session — we
    // resolve features directly from the org snapshot via the no-membership
    // path. Members can't narrow tenant features, so passing null is safe.
    const { resolveAccess } = await import("@shared/entitlements");
    const access = resolveAccess(org, null);
    if (!access.features.customer_portal) {
      return res.status(403).json({
        error: "Customer portal is not available on this plan.",
      });
    }

    const data = await storage.getCustomerPortalData(customer.id);
    if (!data) return res.status(404).send("Not found");

    res.json({
      customer: {
        id: data.customer.id,
        name: data.customer.name,
        email: data.customer.email,
        phone: data.customer.phone,
      },
      org: data.org
        ? {
            name: data.org.name,
            email: data.org.email,
            phone: data.org.phone,
            logoUrl: (data.org as any).logoUrl,
          }
        : null,
      quotes: data.quotes.map((q) => ({
        id: q.id,
        status: q.status,
        total: q.total,
        createdAt: q.createdAt,
        expiresAt: q.expiresAt,
        publicToken: q.publicToken,
      })),
      invoices: data.invoices.map((inv) => ({
        id: inv.id,
        status: inv.status,
        total: inv.total,
        createdAt: inv.createdAt,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        publicToken: inv.publicToken,
      })),
      recentJobs: data.recentJobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        createdAt: j.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
