import { useEffect, useState } from "react";
import { api, dateTimeBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";
import type { User } from "../components/Layout";

const labels: Record<string, string> = { purchase: "Compra", consumption: "Consumo", return: "Devolução", opening: "Saldo inicial", adjustment_in: "Ajuste +", adjustment_out: "Ajuste -", loss: "Perda", loss_reversal: "Estorno de perda" };
const tones: Record<string, string> = { purchase: "success", consumption: "danger", return: "info", opening: "neutral", adjustment_in: "success", adjustment_out: "warning", loss: "danger", loss_reversal: "purple" };

function numberBR(value: unknown): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function StockPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ material_id: "", quantity: 0, notes: "" });
  const load = async () => {
    setLoading(true);
    try {
      const [movements, materialData] = await Promise.all([api<{ items: any[] }>("/stock/movements"), api<{ items: any[] }>("/materials")]);
      setItems(movements.items); setMaterials(materialData.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar movimentações"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await api("/stock/adjust", { method: "POST", body: JSON.stringify(form) }); setOpen(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ajustar o estoque"); }
  };
  const remove = async (movement: any) => {
    const confirmation = window.prompt(`Excluir definitivamente esta movimentação de ${movement.material_name}?\n\nO saldo será recalculado. Digite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    try { await api(`/stock/movements/${movement.id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir a movimentação"); }
  };
  return <><PageHeader eyebrow="MOVIMENTAÇÃO DE MATERIAIS" title="Consumo, baixas e ajustes" description="Auditoria completa das entradas e saídas. Consumos de pedidos são confirmados na própria OS." action={<button className="primary-button" onClick={() => { setForm({ material_id: materials[0]?.id || "", quantity: 0, notes: "" }); setOpen(true); }}>+ Ajuste manual</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhuma movimentação" text="Entradas, consumos e ajustes aparecerão aqui." /> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Material</th><th>Tipo</th><th>Quantidade</th><th>Pedido / Compra</th><th>Usuário</th><th>Observação</th>{user.role === "super_admin" && <th>Ações</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTimeBR(item.created_at)}</td><td><strong>{item.material_name}</strong></td><td><Badge tone={tones[item.type]}>{labels[item.type] || item.type}</Badge></td><td className={Number(item.quantity) < 0 ? "negative-value" : "positive-value"}>{numberBR(item.quantity)} {item.unit}</td><td>{item.order_code || item.purchase_code || "—"}</td><td>{item.user_name || "—"}</td><td>{item.notes || "—"}</td>{user.role === "super_admin" && <td className="actions"><button className="action-danger" onClick={() => void remove(item)}>Excluir definitivamente</button></td>}</tr>)}</tbody></table></div>}</div>
    {open && <Modal title="Ajuste manual de estoque" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Material" wide><select value={form.material_id} onChange={(event) => setForm({ ...form, material_id: event.target.value })}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} — saldo {numberBR(material.current_stock)} {material.unit}</option>)}</select></Field><Field label="Quantidade"><input type="number" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /><small>Use valor positivo para entrada e negativo para saída. A unidade segue o cadastro do material.</small></Field><Field label="Motivo" wide><textarea required value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Confirmar ajuste</button></div></form></Modal>}
  </>;
}
