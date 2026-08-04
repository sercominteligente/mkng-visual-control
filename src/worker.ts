import { Hono } from "hono";
import { authMiddleware, createSession, destroySession, ensureBootstrapAdmin, hashPassword, requirePermission, verifyPassword } from "./server/auth";
import { buildReportPdf } from "./server/pdf";
import type { AppEnv } from "./server/types";

const app = new Hono<AppEnv>();
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function money(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function quantity(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

async function body<T = Record<string, unknown>>(c: any): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new Error("Corpo JSON inválido");
  }
}

async function audit(c: any, action: string, entityType?: string, entityId?: string, details?: unknown): Promise<void> {
  const user = c.get("user");
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id(), user?.id ?? null, action, entityType ?? null, entityId ?? null, details ? JSON.stringify(details) : null)
    .run();
}

function code(prefix: string): string {
  const date = new Date();
  const compact = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${compact}-${suffix}`;
}

app.onError((error, c) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Erro interno";
  return c.json({ error: message }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "MKNG Visual Control", at: now() }));

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path === "/api/auth/login") return next();
  return authMiddleware(c, next);
});

app.post("/api/auth/login", async (c) => {
  await ensureBootstrapAdmin(c);
  const data = await body<{ email?: string; password?: string }>(c);
  const email = data.email?.trim().toLowerCase();
  if (!email || !data.password) return c.json({ error: "Informe usuário/e-mail e senha" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, password_hash, role, status FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
  )
    .bind(email)
    .first<any>();
  if (!user || user.status !== "active" || !(await verifyPassword(data.password, user.password_hash))) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }

  const cookie = await createSession(c, user.id);
  await c.env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now(), now(), user.id)
    .run();
  return c.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } },
    200,
    { "Set-Cookie": cookie },
  );
});

app.post("/api/auth/logout", async (c) => {
  const cookie = await destroySession(c);
  return c.json({ ok: true }, 200, { "Set-Cookie": cookie });
});

app.get("/api/me", (c) => c.json({ user: c.get("user") }));

app.post("/api/auth/change-password", async (c) => {
  const data = await body<{ currentPassword?: string; newPassword?: string }>(c);
  if (!data.currentPassword || !data.newPassword || data.newPassword.length < 10) {
    return c.json({ error: "A nova senha deve ter pelo menos 10 caracteres" }, 400);
  }
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<any>();
  if (!row || !(await verifyPassword(data.currentPassword, row.password_hash))) {
    return c.json({ error: "Senha atual incorreta" }, 400);
  }
  const passwordHash = await hashPassword(data.newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, now(), user.id)
    .run();
  await audit(c, "change_password", "user", user.id);
  return c.json({ ok: true });
});

app.get("/api/dashboard", async (c) => {
  const [orders, production, stock, receivables, payables, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status NOT IN ('completed','cancelled')").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status IN ('production','finishing','installation')").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM materials WHERE active = 1 AND current_stock <= minimum_stock").first<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM receivables WHERE status = 'pending'").first<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payables WHERE status = 'pending'").first<any>(),
    c.env.DB.prepare(
      `SELECT o.id, o.code, o.title, o.status, o.priority, o.due_date, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 8`,
    ).all<any>(),
  ]);
  return c.json({
    activeOrders: orders?.total ?? 0,
    inProduction: production?.total ?? 0,
    lowStock: stock?.total ?? 0,
    receivable: receivables?.total ?? 0,
    payable: payables?.total ?? 0,
    recentOrders: recent.results,
  });
});

app.use("/api/customers", requirePermission("customers"));
app.use("/api/customers/*", requirePermission("customers"));
app.get("/api/customers", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT * FROM customers WHERE name LIKE ? OR COALESCE(document,'') LIKE ? OR COALESCE(contact_name,'') LIKE ? ORDER BY name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});
app.post("/api/customers", async (c) => {
  const data = await body<any>(c);
  if (!data.name?.trim()) return c.json({ error: "Nome do cliente é obrigatório" }, 400);
  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO customers (id,name,document,contact_name,phone,email,address,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(entityId, data.name.trim(), data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active")
    .run();
  await audit(c, "create", "customer", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/customers/:id", async (c) => {
  const data = await body<any>(c);
  await c.env.DB.prepare(
    `UPDATE customers SET name=?,document=?,contact_name=?,phone=?,email=?,address=?,notes=?,status=?,updated_at=? WHERE id=?`,
  )
    .bind(data.name, data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active", now(), c.req.param("id"))
    .run();
  await audit(c, "update", "customer", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/customers/:id", async (c) => {
  const entityId = c.req.param("id");
  const linked = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?").bind(entityId).first<any>();
  if ((linked?.total ?? 0) > 0) return c.json({ error: "Cliente possui pedidos vinculados; desative-o em vez de excluir" }, 409);
  await c.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(entityId).run();
  await audit(c, "delete", "customer", entityId);
  return c.json({ ok: true });
});

app.use("/api/suppliers", requirePermission("suppliers"));
app.use("/api/suppliers/*", requirePermission("suppliers"));
app.get("/api/suppliers", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT * FROM suppliers WHERE name LIKE ? OR COALESCE(document,'') LIKE ? OR COALESCE(contact_name,'') LIKE ? ORDER BY name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});
app.post("/api/suppliers", async (c) => {
  const data = await body<any>(c);
  if (!data.name?.trim()) return c.json({ error: "Nome do fornecedor é obrigatório" }, 400);
  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO suppliers (id,name,document,contact_name,phone,email,address,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(entityId, data.name.trim(), data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active")
    .run();
  await audit(c, "create", "supplier", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/suppliers/:id", async (c) => {
  const data = await body<any>(c);
  await c.env.DB.prepare(
    `UPDATE suppliers SET name=?,document=?,contact_name=?,phone=?,email=?,address=?,notes=?,status=?,updated_at=? WHERE id=?`,
  )
    .bind(data.name, data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active", now(), c.req.param("id"))
    .run();
  await audit(c, "update", "supplier", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/suppliers/:id", async (c) => {
  const entityId = c.req.param("id");
  const linked = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM purchases WHERE supplier_id = ?").bind(entityId).first<any>();
  if ((linked?.total ?? 0) > 0) return c.json({ error: "Fornecedor possui compras vinculadas; desative-o em vez de excluir" }, 409);
  await c.env.DB.prepare("DELETE FROM suppliers WHERE id = ?").bind(entityId).run();
  await audit(c, "delete", "supplier", entityId);
  return c.json({ ok: true });
});

app.use("/api/materials", requirePermission("stock"));
app.use("/api/materials/*", requirePermission("stock"));
app.get("/api/material-categories", requirePermission("stock"), async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM material_categories ORDER BY sort_order, name").all<any>();
  return c.json({ items: result.results });
});
app.post("/api/material-categories", requirePermission("stock"), async (c) => {
  const data = await body<any>(c);
  const entityId = id();
  await c.env.DB.prepare("INSERT INTO material_categories (id,name,sort_order,active) VALUES (?,?,?,?)")
    .bind(entityId, data.name, Number(data.sort_order ?? 0), data.active === false ? 0 : 1)
    .run();
  await audit(c, "create", "material_category", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.get("/api/materials", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT m.*, c.name AS category_name,
      COALESCE((SELECT SUM(MAX(om.reserved_qty - om.consumed_qty + om.returned_qty, 0)) FROM order_materials om JOIN orders o ON o.id=om.order_id WHERE om.material_id=m.id AND o.status NOT IN ('completed','cancelled')),0) AS reserved_stock
     FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id
     WHERE m.name LIKE ? OR COALESCE(m.sku,'') LIKE ? OR COALESCE(c.name,'') LIKE ?
     ORDER BY c.sort_order, m.name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});
app.post("/api/materials", async (c) => {
  const data = await body<any>(c);
  if (!data.name?.trim()) return c.json({ error: "Nome do material é obrigatório" }, 400);
  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO materials (id,category_id,sku,name,description,unit,thickness_mm,width_mm,height_mm,current_stock,minimum_stock,average_cost,location,active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(entityId, data.category_id ?? null, data.sku || null, data.name.trim(), data.description ?? null, data.unit ?? "un", quantity(data.thickness_mm) || null, quantity(data.width_mm) || null, quantity(data.height_mm) || null, quantity(data.current_stock), quantity(data.minimum_stock), money(data.average_cost), data.location ?? null, data.active === false ? 0 : 1)
    .run();
  if (quantity(data.current_stock) !== 0) {
    await c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,notes,user_id) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(id(), entityId, "opening", quantity(data.current_stock), money(data.average_cost), money(data.current_stock) * money(data.average_cost), "Saldo inicial", c.get("user").id)
      .run();
  }
  await audit(c, "create", "material", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/materials/:id", async (c) => {
  const data = await body<any>(c);
  await c.env.DB.prepare(
    `UPDATE materials SET category_id=?,sku=?,name=?,description=?,unit=?,thickness_mm=?,width_mm=?,height_mm=?,minimum_stock=?,average_cost=?,location=?,active=?,updated_at=? WHERE id=?`,
  )
    .bind(data.category_id ?? null, data.sku || null, data.name, data.description ?? null, data.unit ?? "un", quantity(data.thickness_mm) || null, quantity(data.width_mm) || null, quantity(data.height_mm) || null, quantity(data.minimum_stock), money(data.average_cost), data.location ?? null, data.active === false ? 0 : 1, now(), c.req.param("id"))
    .run();
  await audit(c, "update", "material", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/materials/:id", async (c) => {
  const entityId = c.req.param("id");
  const linked = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM stock_movements WHERE material_id = ?").bind(entityId).first<any>();
  if ((linked?.total ?? 0) > 0) return c.json({ error: "Material possui movimentações; desative-o em vez de excluir" }, 409);
  await c.env.DB.prepare("DELETE FROM materials WHERE id = ?").bind(entityId).run();
  await audit(c, "delete", "material", entityId);
  return c.json({ ok: true });
});

app.use("/api/stock", requirePermission("stock"));
app.use("/api/stock/*", requirePermission("stock"));
app.get("/api/stock/movements", async (c) => {
  const materialId = c.req.query("materialId");
  const where = materialId ? "WHERE sm.material_id = ?" : "";
  const statement = c.env.DB.prepare(
    `SELECT sm.*, m.name AS material_name, m.unit, o.code AS order_code, p.code AS purchase_code, u.name AS user_name
     FROM stock_movements sm
     JOIN materials m ON m.id=sm.material_id
     LEFT JOIN orders o ON o.id=sm.order_id
     LEFT JOIN purchases p ON p.id=sm.purchase_id
     LEFT JOIN users u ON u.id=sm.user_id
     ${where} ORDER BY sm.created_at DESC LIMIT 500`,
  );
  const result = materialId ? await statement.bind(materialId).all<any>() : await statement.all<any>();
  return c.json({ items: result.results });
});
app.post("/api/stock/adjust", async (c) => {
  const data = await body<any>(c);
  const qty = quantity(data.quantity);
  if (!data.material_id || qty === 0) return c.json({ error: "Material e quantidade são obrigatórios" }, 400);
  const material = await c.env.DB.prepare("SELECT current_stock, average_cost FROM materials WHERE id=?").bind(data.material_id).first<any>();
  if (!material) return c.json({ error: "Material não encontrado" }, 404);
  const newStock = quantity(material.current_stock) + qty;
  if (newStock < 0) return c.json({ error: "Ajuste deixaria o estoque negativo" }, 409);
  const movementId = id();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,notes,user_id) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(movementId, data.material_id, qty > 0 ? "adjustment_in" : "adjustment_out", qty, money(material.average_cost), money(qty * material.average_cost), data.notes ?? "Ajuste manual", c.get("user").id),
  ]);
  await audit(c, "stock_adjust", "material", data.material_id, { quantity: qty, newStock, notes: data.notes });
  return c.json({ ok: true, newStock });
});

app.use("/api/purchases", requirePermission("purchases"));
app.use("/api/purchases/*", requirePermission("purchases"));
app.get("/api/purchases", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT p.*, s.name AS supplier_name, COUNT(pi.id) AS item_count
     FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN purchase_items pi ON pi.purchase_id=p.id
     GROUP BY p.id ORDER BY p.created_at DESC`,
  ).all<any>();
  return c.json({ items: result.results });
});
app.get("/api/purchases/:id", async (c) => {
  const purchase = await c.env.DB.prepare(
    `SELECT p.*, s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?`,
  ).bind(c.req.param("id")).first<any>();
  if (!purchase) return c.json({ error: "Compra não encontrada" }, 404);
  const items = await c.env.DB.prepare(
    `SELECT pi.*, m.name AS material_name, m.unit FROM purchase_items pi JOIN materials m ON m.id=pi.material_id WHERE pi.purchase_id=?`,
  ).bind(purchase.id).all<any>();
  return c.json({ purchase, items: items.results });
});
app.post("/api/purchases", async (c) => {
  const data = await body<any>(c);
  const items = Array.isArray(data.items) ? data.items : [];
  if (!data.supplier_id || !items.length) return c.json({ error: "Fornecedor e itens são obrigatórios" }, 400);
  const purchaseId = id();
  const purchaseCode = data.code || code("CMP");
  const total = items.reduce((sum: number, item: any) => sum + quantity(item.quantity) * money(item.unit_cost), 0);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO purchases (id,code,supplier_id,invoice_number,status,issued_at,expected_at,total,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(purchaseId, purchaseCode, data.supplier_id, data.invoice_number ?? null, data.status ?? "draft", data.issued_at ?? now().slice(0, 10), data.expected_at ?? null, money(total), data.notes ?? null, c.get("user").id),
  ];
  for (const item of items) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO purchase_items (id,purchase_id,material_id,quantity,unit_cost,total) VALUES (?,?,?,?,?,?)",
      ).bind(id(), purchaseId, item.material_id, quantity(item.quantity), money(item.unit_cost), money(quantity(item.quantity) * money(item.unit_cost))),
    );
  }
  await c.env.DB.batch(statements);
  await audit(c, "create", "purchase", purchaseId, { ...data, total });
  return c.json({ id: purchaseId, code: purchaseCode }, 201);
});
app.post("/api/purchases/:id/receive", async (c) => {
  const purchaseId = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT * FROM purchases WHERE id=?").bind(purchaseId).first<any>();
  if (!purchase) return c.json({ error: "Compra não encontrada" }, 404);
  if (purchase.status === "received") return c.json({ error: "Compra já recebida" }, 409);
  const items = await c.env.DB.prepare("SELECT * FROM purchase_items WHERE purchase_id=?").bind(purchaseId).all<any>();
  const statements: D1PreparedStatement[] = [];
  for (const item of items.results) {
    const material = await c.env.DB.prepare("SELECT current_stock,average_cost FROM materials WHERE id=?").bind(item.material_id).first<any>();
    const oldStock = quantity(material?.current_stock);
    const receivedQty = quantity(item.quantity);
    const unitCost = money(item.unit_cost);
    const newStock = oldStock + receivedQty;
    const newAverage = newStock > 0 ? money((oldStock * money(material?.average_cost) + receivedQty * unitCost) / newStock) : unitCost;
    statements.push(
      c.env.DB.prepare("UPDATE materials SET current_stock=?,average_cost=?,updated_at=? WHERE id=?").bind(newStock, newAverage, now(), item.material_id),
      c.env.DB.prepare(
        "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,purchase_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(id(), item.material_id, "purchase", receivedQty, unitCost, money(receivedQty * unitCost), purchaseId, `Recebimento ${purchase.code}`, c.get("user").id),
    );
  }
  statements.push(c.env.DB.prepare("UPDATE purchases SET status='received',received_at=?,updated_at=? WHERE id=?").bind(now(), now(), purchaseId));
  await c.env.DB.batch(statements);
  await audit(c, "receive", "purchase", purchaseId);
  return c.json({ ok: true });
});

app.use("/api/orders", requirePermission("orders"));
app.use("/api/orders/*", requirePermission("orders"));
app.get("/api/orders", async (c) => {
  const status = c.req.query("status");
  const search = c.req.query("q")?.trim() ?? "";
  let sql = `SELECT o.*, c.name AS customer_name, u.name AS created_by_name
             FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.created_by
             WHERE (o.code LIKE ? OR o.title LIKE ? OR COALESCE(c.name,'') LIKE ?)`;
  const params: unknown[] = [`%${search}%`, `%${search}%`, `%${search}%`];
  if (status) { sql += " AND o.status = ?"; params.push(status); }
  sql += " ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, o.due_date, o.created_at DESC";
  const result = await c.env.DB.prepare(sql).bind(...params).all<any>();
  return c.json({ items: result.results });
});
app.get("/api/orders/:id", async (c) => {
  const order = await c.env.DB.prepare(
    `SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=?`,
  ).bind(c.req.param("id")).first<any>();
  if (!order) return c.json({ error: "Pedido não encontrado" }, 404);
  const [items, materials, steps, attachments] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM order_items WHERE order_id=?").bind(order.id).all<any>(),
    c.env.DB.prepare(
      `SELECT om.*,m.name AS material_name,m.unit,m.current_stock FROM order_materials om JOIN materials m ON m.id=om.material_id WHERE om.order_id=?`,
    ).bind(order.id).all<any>(),
    c.env.DB.prepare("SELECT ps.*,u.name AS assignee_name FROM production_steps ps LEFT JOIN users u ON u.id=ps.assignee_id WHERE ps.order_id=? ORDER BY ps.created_at").bind(order.id).all<any>(),
    c.env.DB.prepare("SELECT id,filename,mime_type,size_bytes,created_at FROM attachments WHERE entity_type='order' AND entity_id=? ORDER BY created_at DESC").bind(order.id).all<any>(),
  ]);
  return c.json({ order, items: items.results, materials: materials.results, steps: steps.results, attachments: attachments.results });
});
app.post("/api/orders", async (c) => {
  const data = await body<any>(c);
  if (!data.title?.trim()) return c.json({ error: "Título do pedido é obrigatório" }, 400);
  const orderId = id();
  const orderCode = data.code || code("OS");
  const items = Array.isArray(data.items) ? data.items : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const total = items.reduce((sum: number, item: any) => sum + quantity(item.quantity) * money(item.unit_price), money(data.total_price));
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO orders (id,code,customer_id,title,description,priority,status,due_date,total_price,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(orderId, orderCode, data.customer_id ?? null, data.title.trim(), data.description ?? null, data.priority ?? "normal", data.status ?? "draft", data.due_date ?? null, money(total), data.notes ?? null, c.get("user").id),
  ];
  for (const item of items) {
    statements.push(c.env.DB.prepare("INSERT INTO order_items (id,order_id,description,quantity,unit_price,total_price) VALUES (?,?,?,?,?,?)")
      .bind(id(), orderId, item.description, quantity(item.quantity), money(item.unit_price), money(quantity(item.quantity) * money(item.unit_price))));
  }
  for (const material of materials) {
    statements.push(c.env.DB.prepare("INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,notes) VALUES (?,?,?,?,?,?)")
      .bind(id(), orderId, material.material_id, quantity(material.planned_qty), quantity(material.reserved_qty ?? material.planned_qty), material.notes ?? null));
  }
  statements.push(c.env.DB.prepare("INSERT INTO production_steps (id,order_id,stage,status) VALUES (?,?,?,?)").bind(id(), orderId, "briefing", "pending"));
  await c.env.DB.batch(statements);
  await audit(c, "create", "order", orderId, data);
  return c.json({ id: orderId, code: orderCode }, 201);
});
app.put("/api/orders/:id", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  await c.env.DB.prepare(
    `UPDATE orders SET customer_id=?,title=?,description=?,priority=?,status=?,due_date=?,total_price=?,notes=?,updated_at=? WHERE id=?`,
  ).bind(data.customer_id ?? null, data.title, data.description ?? null, data.priority ?? "normal", data.status ?? "draft", data.due_date ?? null, money(data.total_price), data.notes ?? null, now(), orderId).run();
  await audit(c, "update", "order", orderId, data);
  return c.json({ ok: true });
});
app.post("/api/orders/:id/materials", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  await c.env.DB.prepare(
    `INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,notes)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(order_id,material_id) DO UPDATE SET planned_qty=excluded.planned_qty,reserved_qty=excluded.reserved_qty,notes=excluded.notes`,
  ).bind(id(), orderId, data.material_id, quantity(data.planned_qty), quantity(data.reserved_qty ?? data.planned_qty), data.notes ?? null).run();
  await audit(c, "plan_material", "order", orderId, data);
  return c.json({ ok: true });
});
app.post("/api/orders/:id/consume", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  const qty = quantity(data.quantity);
  if (!data.material_id || qty <= 0) return c.json({ error: "Material e quantidade são obrigatórios" }, 400);
  const order = await c.env.DB.prepare("SELECT code,status FROM orders WHERE id=?").bind(orderId).first<any>();
  const material = await c.env.DB.prepare("SELECT current_stock,average_cost,name FROM materials WHERE id=?").bind(data.material_id).first<any>();
  if (!order || !material) return c.json({ error: "Pedido ou material não encontrado" }, 404);
  if (quantity(material.current_stock) < qty) return c.json({ error: `Estoque insuficiente de ${material.name}` }, 409);
  const newStock = quantity(material.current_stock) - qty;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare(`INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,consumed_qty) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id,material_id) DO UPDATE SET consumed_qty=order_materials.consumed_qty+excluded.consumed_qty`).bind(id(), orderId, data.material_id, 0, 0, qty),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,order_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id(), data.material_id, "consumption", -qty, money(material.average_cost), -money(qty * material.average_cost), orderId, data.notes ?? `Consumo confirmado no ${order.code}`, c.get("user").id),
  ]);
  await audit(c, "consume_material", "order", orderId, { material_id: data.material_id, quantity: qty, newStock });
  return c.json({ ok: true, newStock });
});
app.post("/api/orders/:id/return", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  const qty = quantity(data.quantity);
  if (!data.material_id || qty <= 0) return c.json({ error: "Material e quantidade são obrigatórios" }, 400);
  const material = await c.env.DB.prepare("SELECT current_stock,average_cost,name FROM materials WHERE id=?").bind(data.material_id).first<any>();
  const relation = await c.env.DB.prepare("SELECT consumed_qty,returned_qty FROM order_materials WHERE order_id=? AND material_id=?").bind(orderId, data.material_id).first<any>();
  const availableReturn = quantity(relation?.consumed_qty) - quantity(relation?.returned_qty);
  if (qty > availableReturn) return c.json({ error: "Quantidade devolvida excede o consumo confirmado" }, 409);
  const newStock = quantity(material.current_stock) + qty;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare("UPDATE order_materials SET returned_qty=returned_qty+? WHERE order_id=? AND material_id=?").bind(qty, orderId, data.material_id),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,order_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id(), data.material_id, "return", qty, money(material.average_cost), money(qty * material.average_cost), orderId, data.notes ?? "Devolução de sobra", c.get("user").id),
  ]);
  await audit(c, "return_material", "order", orderId, { material_id: data.material_id, quantity: qty, newStock });
  return c.json({ ok: true, newStock });
});
app.post("/api/orders/:id/stage", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  const stage = String(data.stage ?? "production");
  const statusMap: Record<string, string> = {
    briefing: "approved", design: "approved", printing: "production", finishing: "finishing", installation: "installation", completed: "completed",
  };
  const orderStatus = statusMap[stage] ?? "production";
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE production_steps SET status='completed',completed_at=? WHERE order_id=? AND status='in_progress'").bind(now(), orderId),
    c.env.DB.prepare("INSERT INTO production_steps (id,order_id,stage,status,assignee_id,started_at,notes) VALUES (?,?,?,?,?,?,?)")
      .bind(id(), orderId, stage, stage === "completed" ? "completed" : "in_progress", data.assignee_id ?? null, now(), data.notes ?? null),
    c.env.DB.prepare("UPDATE orders SET status=?,started_at=COALESCE(started_at,?),completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END,updated_at=? WHERE id=?")
      .bind(orderStatus, now(), stage, now(), now(), orderId),
  ]);
  await audit(c, "change_stage", "order", orderId, data);
  return c.json({ ok: true, status: orderStatus });
});
app.delete("/api/orders/:id", async (c) => {
  const orderId = c.req.param("id");
  const movement = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM stock_movements WHERE order_id=?").bind(orderId).first<any>();
  if ((movement?.total ?? 0) > 0) return c.json({ error: "Pedido possui consumo de estoque; cancele-o em vez de excluir" }, 409);
  await c.env.DB.prepare("DELETE FROM orders WHERE id=?").bind(orderId).run();
  await audit(c, "delete", "order", orderId);
  return c.json({ ok: true });
});

app.use("/api/finance", requirePermission("finance"));
app.use("/api/finance/*", requirePermission("finance"));
app.get("/api/finance", async (c) => {
  const kind = c.req.query("kind") === "payable" ? "payables" : "receivables";
  const relation = kind === "payables" ? "suppliers" : "customers";
  const relationId = kind === "payables" ? "supplier_id" : "customer_id";
  const result = await c.env.DB.prepare(
    `SELECT f.*, r.name AS party_name FROM ${kind} f LEFT JOIN ${relation} r ON r.id=f.${relationId} ORDER BY CASE f.status WHEN 'overdue' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, f.due_date`,
  ).all<any>();
  return c.json({ items: result.results, kind });
});
app.post("/api/finance", async (c) => {
  const data = await body<any>(c);
  const kind = data.kind === "payable" ? "payables" : "receivables";
  const entityId = id();
  if (kind === "payables") {
    await c.env.DB.prepare("INSERT INTO payables (id,purchase_id,supplier_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(entityId, data.purchase_id ?? null, data.supplier_id ?? null, data.description, money(data.amount), data.due_date ?? null, data.status ?? "pending", data.notes ?? null).run();
  } else {
    await c.env.DB.prepare("INSERT INTO receivables (id,order_id,customer_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(entityId, data.order_id ?? null, data.customer_id ?? null, data.description, money(data.amount), data.due_date ?? null, data.status ?? "pending", data.notes ?? null).run();
  }
  await audit(c, "create", kind === "payables" ? "payable" : "receivable", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/finance/:kind/:id", async (c) => {
  const data = await body<any>(c);
  const table = c.req.param("kind") === "payable" ? "payables" : "receivables";
  const paidAt = data.status === "paid" ? data.paid_at ?? now() : null;
  await c.env.DB.prepare(`UPDATE ${table} SET description=?,amount=?,due_date=?,paid_at=?,status=?,notes=?,updated_at=? WHERE id=?`)
    .bind(data.description, money(data.amount), data.due_date ?? null, paidAt, data.status ?? "pending", data.notes ?? null, now(), c.req.param("id")).run();
  await audit(c, "update", table === "payables" ? "payable" : "receivable", c.req.param("id"), data);
  return c.json({ ok: true });
});

app.use("/api/users", requirePermission("users"));
app.use("/api/users/*", requirePermission("users"));
app.get("/api/users", async (c) => {
  const result = await c.env.DB.prepare("SELECT id,name,email,role,status,last_login_at,created_at FROM users ORDER BY name").all<any>();
  return c.json({ items: result.results });
});
app.post("/api/users", async (c) => {
  const data = await body<any>(c);
  if (!data.name || !data.email || !data.password || data.password.length < 10) return c.json({ error: "Nome, e-mail e senha com 10+ caracteres são obrigatórios" }, 400);
  const entityId = id();
  const passwordHash = await hashPassword(data.password);
  await c.env.DB.prepare("INSERT INTO users (id,name,email,password_hash,role,status) VALUES (?,?,?,?,?,?)")
    .bind(entityId, data.name, String(data.email).toLowerCase(), passwordHash, data.role ?? "viewer", data.status ?? "active").run();
  await audit(c, "create", "user", entityId, { ...data, password: undefined });
  return c.json({ id: entityId }, 201);
});
app.put("/api/users/:id", async (c) => {
  const data = await body<any>(c);
  const userId = c.req.param("id");
  if (data.password) {
    if (data.password.length < 10) return c.json({ error: "A senha deve ter pelo menos 10 caracteres" }, 400);
    const passwordHash = await hashPassword(data.password);
    await c.env.DB.prepare("UPDATE users SET name=?,email=?,role=?,status=?,password_hash=?,updated_at=? WHERE id=?")
      .bind(data.name, String(data.email).toLowerCase(), data.role, data.status, passwordHash, now(), userId).run();
  } else {
    await c.env.DB.prepare("UPDATE users SET name=?,email=?,role=?,status=?,updated_at=? WHERE id=?")
      .bind(data.name, String(data.email).toLowerCase(), data.role, data.status, now(), userId).run();
  }
  await audit(c, "update", "user", userId, { ...data, password: undefined });
  return c.json({ ok: true });
});

app.use("/api/settings", requirePermission("settings"));
app.use("/api/settings/*", requirePermission("settings"));
app.get("/api/settings", async (c) => {
  const result = await c.env.DB.prepare("SELECT key,value,updated_at FROM settings ORDER BY key").all<any>();
  return c.json({ items: result.results });
});
app.put("/api/settings", async (c) => {
  const data = await body<Record<string, unknown>>(c);
  const statements = Object.entries(data).map(([key, value]) => c.env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  ).bind(key, String(value ?? ""), now()));
  if (statements.length) await c.env.DB.batch(statements);
  await audit(c, "update", "settings", undefined, data);
  return c.json({ ok: true });
});

app.post("/api/attachments", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  if (!(file instanceof File) || !entityType || !entityId) return c.json({ error: "Arquivo e entidade são obrigatórios" }, 400);
  const maxBytes = Number(c.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
  if (file.size > maxBytes) return c.json({ error: `Arquivo excede ${c.env.MAX_UPLOAD_MB || 25} MB` }, 413);
  const attachmentId = id();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${entityType}/${entityId}/${attachmentId}-${safeName}`;
  await c.env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  await c.env.DB.prepare(
    "INSERT INTO attachments (id,entity_type,entity_id,r2_key,filename,mime_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(attachmentId, entityType, entityId, key, file.name, file.type || null, file.size, c.get("user").id).run();
  await audit(c, "upload", "attachment", attachmentId, { entityType, entityId, filename: file.name });
  return c.json({ id: attachmentId, filename: file.name }, 201);
});
app.get("/api/attachments/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(c.req.param("id")).first<any>();
  if (!row) return c.json({ error: "Arquivo não encontrado" }, 404);
  const object = await c.env.BUCKET.get(row.r2_key);
  if (!object) return c.json({ error: "Arquivo ausente no armazenamento" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(object.body, { headers });
});
app.delete("/api/attachments/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(c.req.param("id")).first<any>();
  if (!row) return c.json({ error: "Arquivo não encontrado" }, 404);
  await c.env.BUCKET.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id=?").bind(row.id).run();
  await audit(c, "delete", "attachment", row.id);
  return c.json({ ok: true });
});

app.use("/api/reports", requirePermission("reports"));
app.use("/api/reports/*", requirePermission("reports"));
app.get("/api/reports/:type.pdf", async (c) => {
  const type = c.req.param("type");
  const from = c.req.query("from") || "2000-01-01";
  const to = c.req.query("to") || "2999-12-31";
  let pdf: Uint8Array;
  if (type === "stock") {
    const result = await c.env.DB.prepare(
      `SELECT m.sku,m.name,c.name AS category,m.unit,m.current_stock,m.minimum_stock,m.average_cost,m.location
       FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id WHERE m.active=1 ORDER BY c.sort_order,m.name`,
    ).all<any>();
    const totalValue = result.results.reduce((sum: number, row: any) => sum + money(row.current_stock) * money(row.average_cost), 0);
    pdf = await buildReportPdf({
      title: "Relatório de Estoque",
      subtitle: "Posição atual de chapas, tintas, insumos e materiais",
      rows: result.results,
      summary: [`Itens cadastrados: ${result.results.length}`, `Valor estimado em estoque: ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`],
      columns: [
        { label: "SKU", width: 70, value: (r) => r.sku || "—" },
        { label: "Material", width: 170, value: (r) => r.name },
        { label: "Categoria", width: 110, value: (r) => r.category || "—" },
        { label: "Un.", width: 45, value: (r) => r.unit },
        { label: "Estoque", width: 65, value: (r) => String(r.current_stock) },
        { label: "Mínimo", width: 60, value: (r) => String(r.minimum_stock) },
        { label: "Custo médio", width: 80, value: (r) => money(r.average_cost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { label: "Local", width: 90, value: (r) => r.location || "—" },
      ],
    });
  } else if (type === "finance") {
    const receivables = await c.env.DB.prepare("SELECT r.*,c.name AS party FROM receivables r LEFT JOIN customers c ON c.id=r.customer_id WHERE COALESCE(r.due_date,'') BETWEEN ? AND ? ORDER BY r.due_date").bind(from, to).all<any>();
    const payables = await c.env.DB.prepare("SELECT p.*,s.name AS party FROM payables p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE COALESCE(p.due_date,'') BETWEEN ? AND ? ORDER BY p.due_date").bind(from, to).all<any>();
    const rows = [
      ...receivables.results.map((r: any) => ({ ...r, kind: "Receber" })),
      ...payables.results.map((r: any) => ({ ...r, kind: "Pagar" })),
    ];
    pdf = await buildReportPdf({
      title: "Relatório Financeiro",
      subtitle: `Período de ${from} a ${to}`,
      rows,
      summary: [
        `Contas a receber: ${receivables.results.reduce((s: number, r: any) => s + money(r.amount), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        `Contas a pagar: ${payables.results.reduce((s: number, r: any) => s + money(r.amount), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      ],
      columns: [
        { label: "Tipo", width: 65, value: (r) => r.kind },
        { label: "Descrição", width: 210, value: (r) => r.description },
        { label: "Cliente / Fornecedor", width: 160, value: (r) => r.party || "—" },
        { label: "Vencimento", width: 90, value: (r) => r.due_date || "—" },
        { label: "Valor", width: 90, value: (r) => money(r.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { label: "Status", width: 80, value: (r) => r.status },
      ],
    });
  } else if (type === "movements") {
    const result = await c.env.DB.prepare(
      `SELECT sm.*,m.name AS material_name,m.unit,o.code AS order_code,p.code AS purchase_code,u.name AS user_name
       FROM stock_movements sm JOIN materials m ON m.id=sm.material_id
       LEFT JOIN orders o ON o.id=sm.order_id LEFT JOIN purchases p ON p.id=sm.purchase_id LEFT JOIN users u ON u.id=sm.user_id
       WHERE substr(sm.created_at,1,10) BETWEEN ? AND ? ORDER BY sm.created_at DESC`,
    ).bind(from, to).all<any>();
    pdf = await buildReportPdf({
      title: "Movimentações de Estoque",
      subtitle: `Período de ${from} a ${to}`,
      rows: result.results,
      summary: [`Movimentações registradas: ${result.results.length}`],
      columns: [
        { label: "Data", width: 95, value: (r) => String(r.created_at).replace("T", " ").slice(0, 16) },
        { label: "Material", width: 160, value: (r) => r.material_name },
        { label: "Tipo", width: 90, value: (r) => r.type },
        { label: "Quantidade", width: 80, value: (r) => `${r.quantity} ${r.unit}` },
        { label: "Pedido/Compra", width: 100, value: (r) => r.order_code || r.purchase_code || "—" },
        { label: "Usuário", width: 105, value: (r) => r.user_name || "—" },
        { label: "Observação", width: 150, value: (r) => r.notes || "—" },
      ],
    });
  } else {
    const result = await c.env.DB.prepare(
      `SELECT o.code,o.title,o.status,o.priority,o.due_date,o.total_price,c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
       WHERE substr(o.created_at,1,10) BETWEEN ? AND ? ORDER BY o.created_at DESC`,
    ).bind(from, to).all<any>();
    pdf = await buildReportPdf({
      title: "Relatório de Pedidos e Produção",
      subtitle: `Período de ${from} a ${to}`,
      rows: result.results,
      summary: [`Pedidos no período: ${result.results.length}`, `Valor total: ${result.results.reduce((s: number, r: any) => s + money(r.total_price), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`],
      columns: [
        { label: "Código", width: 90, value: (r) => r.code },
        { label: "Pedido", width: 190, value: (r) => r.title },
        { label: "Cliente", width: 145, value: (r) => r.customer_name || "—" },
        { label: "Status", width: 90, value: (r) => r.status },
        { label: "Prioridade", width: 80, value: (r) => r.priority },
        { label: "Entrega", width: 90, value: (r) => r.due_date || "—" },
        { label: "Valor", width: 90, value: (r) => money(r.total_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      ],
    });
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="mkng-${type}-${from}-${to}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.get("/api/audit", requirePermission("settings"), async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT a.*,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500`,
  ).all<any>();
  return c.json({ items: result.results });
});

export default app;
