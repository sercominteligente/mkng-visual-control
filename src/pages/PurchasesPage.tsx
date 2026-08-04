import { useEffect, useState } from "react";
import { api, brl, dateBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";

export function PurchasesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ supplier_id: "", invoice_number: "", issued_at: new Date().toISOString().slice(0, 10), expected_at: "", notes: "", items: [] });
  const load = async () => {
    setLoading(true);
    try {
      const [purchases, supplierData, materialData] = await Promise.all([api<{ items: any[] }>("/purchases"), api<{ items: any[] }>("/suppliers"), api<{ items: any[] }>("/materials")]);
      setItems(purchases.items); setSuppliers(supplierData.items); setMaterials(materialData.items);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const addRow = () => setForm({ ...form, items: [...form.items, { material_id: materials[0]?.id ?? "", quantity: 1, unit_cost: 0 }] });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await api("/purchases", { method: "POST", body: JSON.stringify(form) });
    setOpen(false); setForm({ supplier_id: "", invoice_number: "", issued_at: new Date().toISOString().slice(0, 10), expected_at: "", notes: "", items: [] }); await load();
  };
  const receive = async (purchase: any) => {
    if (!window.confirm(`Confirmar recebimento da compra ${purchase.code}? Isso dará entrada no estoque.`)) return;
    await api(`/purchases/${purchase.id}/receive`, { method: "POST" }); await load();
  };
  return <><PageHeader eyebrow="SUPRIMENTOS" title="Entradas e compras" description="Registre compras e confirme o recebimento para dar entrada automática no estoque." action={<button className="primary-button" onClick={() => { setOpen(true); if (!form.items.length) addRow(); }}>+ Nova compra</button>} />
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhuma compra registrada" text="Cadastre a primeira compra de chapas, tintas ou insumos." /> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Fornecedor</th><th>Nota fiscal</th><th>Emissão</th><th>Itens</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.code}</strong></td><td>{purchase.supplier_name || "—"}</td><td>{purchase.invoice_number || "—"}</td><td>{dateBR(purchase.issued_at)}</td><td>{purchase.item_count}</td><td>{brl(purchase.total)}</td><td><Badge tone={purchase.status === "received" ? "success" : purchase.status === "cancelled" ? "danger" : "warning"}>{purchase.status === "received" ? "Recebida" : purchase.status}</Badge></td><td className="actions">{purchase.status !== "received" && <button onClick={() => void receive(purchase)}>Receber</button>}</td></tr>)}</tbody></table></div>}</div>
    {open && <Modal title="Nova compra" onClose={() => setOpen(false)} width={930}><form className="form-grid" onSubmit={save}><Field label="Fornecedor"><select required value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}><option value="">Selecione...</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field><Field label="Nota fiscal"><input value={form.invoice_number} onChange={(event) => setForm({ ...form, invoice_number: event.target.value })} /></Field><Field label="Data de emissão"><input type="date" value={form.issued_at} onChange={(event) => setForm({ ...form, issued_at: event.target.value })} /></Field><Field label="Previsão de entrega"><input type="date" value={form.expected_at} onChange={(event) => setForm({ ...form, expected_at: event.target.value })} /></Field><Field label="Observações" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="wide subform"><div className="subform-head"><div><strong>Itens da compra</strong><small>O estoque será atualizado somente quando o recebimento for confirmado.</small></div><button type="button" className="secondary-button" onClick={addRow}>+ Item</button></div>{form.items.map((row: any, index: number) => <div className="purchase-row" key={index}><select value={row.material_id} onChange={(event) => { const next = [...form.items]; next[index].material_id = event.target.value; setForm({ ...form, items: next }); }}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><input type="number" step="0.001" placeholder="Quantidade" value={row.quantity} onChange={(event) => { const next = [...form.items]; next[index].quantity = event.target.value; setForm({ ...form, items: next }); }} /><input type="number" step="0.01" placeholder="Custo unitário" value={row.unit_cost} onChange={(event) => { const next = [...form.items]; next[index].unit_cost = event.target.value; setForm({ ...form, items: next }); }} /><strong>{brl(Number(row.quantity || 0) * Number(row.unit_cost || 0))}</strong><button type="button" className="danger-link" onClick={() => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== index) })}>Remover</button></div>)}</div><div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Salvar compra</button></div></form></Modal>}
  </>;
}
