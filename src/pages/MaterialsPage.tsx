import { useEffect, useState } from "react";
import { api, brl } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader, StatCard } from "../components/UI";

const blank = { category_id: "", sku: "", name: "", description: "", unit: "un", thickness_mm: "", width_mm: "", height_mm: "", current_stock: 0, minimum_stock: 0, average_cost: 0, location: "", active: true };

export function MaterialsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>(blank);
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [materials, categoryData] = await Promise.all([
        api<{ items: any[] }>(`/materials?q=${encodeURIComponent(search)}`),
        api<{ items: any[] }>("/material-categories"),
      ]);
      setItems(materials.items);
      setCategories(categoryData.items);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar estoque"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const low = items.filter((item) => Number(item.current_stock) <= Number(item.minimum_stock)).length;
  const value = items.reduce((sum, item) => sum + Number(item.current_stock) * Number(item.average_cost), 0);

  const startNew = () => { setEditing(null); setForm({ ...blank, category_id: categories[0]?.id ?? "" }); setOpen(true); };
  const startEdit = (item: any) => { setEditing(item); setForm({ ...item, active: Boolean(item.active) }); setOpen(true); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await api(editing ? `/materials/${editing.id}` : "/materials", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar"); }
    finally { setSaving(false); }
  };

  return <>
    <PageHeader eyebrow="ESTOQUE E MATERIAIS" title="Chapas, tintas e insumos" description="Controle de saldo, estoque mínimo, custo médio, dimensões e localização." action={<button className="primary-button" onClick={startNew}>+ Novo material</button>} />
    <div className="stats-grid four"><StatCard label="Materiais ativos" value={items.length} /><StatCard label="Estoque crítico" value={low} tone={low ? "red" : "green"} /><StatCard label="Valor estimado" value={brl(value)} tone="green" /><StatCard label="Categorias" value={categories.length} tone="purple" /></div>
    {error && <div className="alert error">{error}</div>}
    <div className="panel toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="Buscar por material, SKU ou categoria..." /><button className="secondary-button" onClick={load}>Buscar</button></div>
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Estoque ainda vazio" text="Cadastre chapas de PVC, PS, tintas e demais insumos." /> : <div className="table-wrap"><table><thead><tr><th>Material</th><th>Categoria</th><th>Dimensões</th><th>Saldo</th><th>Reservado</th><th>Disponível</th><th>Mínimo</th><th>Custo médio</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((item) => {
      const available = Number(item.current_stock) - Number(item.reserved_stock || 0);
      const critical = Number(item.current_stock) <= Number(item.minimum_stock);
      return <tr key={item.id}><td><strong>{item.name}</strong><small className="cell-sub">{item.sku || "Sem SKU"} · {item.location || "Sem localização"}</small></td><td>{item.category_name || "—"}</td><td>{item.width_mm || item.height_mm || item.thickness_mm ? `${item.width_mm || "—"} × ${item.height_mm || "—"} × ${item.thickness_mm || "—"} mm` : "—"}</td><td>{item.current_stock} {item.unit}</td><td>{Number(item.reserved_stock || 0).toFixed(2)} {item.unit}</td><td><strong className={available < 0 ? "text-red" : "text-green"}>{available.toFixed(2)} {item.unit}</strong></td><td>{item.minimum_stock} {item.unit}</td><td>{brl(item.average_cost)}</td><td><Badge tone={critical ? "danger" : "success"}>{critical ? "Crítico" : "OK"}</Badge></td><td className="actions"><button onClick={() => startEdit(item)}>Editar</button></td></tr>;
    })}</tbody></table></div>}</div>
    {open && <Modal title={editing ? "Editar material" : "Novo material"} onClose={() => setOpen(false)} width={860}><form className="form-grid" onSubmit={save}>
      <Field label="Categoria"><select value={form.category_id || ""} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      <Field label="SKU"><input value={form.sku || ""} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>
      <Field label="Nome do material" wide><input required value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: PVC expandido branco 3 mm" /></Field>
      <Field label="Descrição" wide><textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label="Unidade"><select value={form.unit || "un"} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option value="un">Unidade</option><option value="chapa">Chapa</option><option value="m">Metro</option><option value="m2">Metro²</option><option value="l">Litro</option><option value="ml">Mililitro</option><option value="kg">Quilograma</option><option value="rolo">Rolo</option><option value="kit">Kit</option></select></Field>
      <Field label="Espessura (mm)"><input type="number" step="0.01" value={form.thickness_mm ?? ""} onChange={(event) => setForm({ ...form, thickness_mm: event.target.value })} /></Field>
      <Field label="Largura (mm)"><input type="number" step="0.01" value={form.width_mm ?? ""} onChange={(event) => setForm({ ...form, width_mm: event.target.value })} /></Field>
      <Field label="Altura (mm)"><input type="number" step="0.01" value={form.height_mm ?? ""} onChange={(event) => setForm({ ...form, height_mm: event.target.value })} /></Field>
      {!editing && <Field label="Saldo inicial"><input type="number" step="0.001" value={form.current_stock ?? 0} onChange={(event) => setForm({ ...form, current_stock: event.target.value })} /></Field>}
      <Field label="Estoque mínimo"><input type="number" step="0.001" value={form.minimum_stock ?? 0} onChange={(event) => setForm({ ...form, minimum_stock: event.target.value })} /></Field>
      <Field label="Custo médio"><input type="number" step="0.01" value={form.average_cost ?? 0} onChange={(event) => setForm({ ...form, average_cost: event.target.value })} /></Field>
      <Field label="Localização"><input value={form.location || ""} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Ex.: Prateleira A2" /></Field>
      <div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar material"}</button></div>
    </form></Modal>}
  </>;
}
