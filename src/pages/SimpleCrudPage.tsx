import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";

type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  wide?: boolean;
};

type ColumnConfig = {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
};

export function SimpleCrudPage({
  title,
  eyebrow,
  description,
  endpoint,
  entityName,
  fields,
  columns,
}: {
  title: string;
  eyebrow: string;
  description: string;
  endpoint: string;
  entityName: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ items: any[] }>(`${endpoint}?q=${encodeURIComponent(search)}`);
      setItems(data.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const initial = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, field.type === "select" ? field.options?.[0]?.value ?? "" : ""])), [fields]);
  const [form, setForm] = useState<Record<string, any>>(initial);

  const startNew = () => { setEditing(null); setForm(initial); setOpen(true); };
  const startEdit = (item: any) => { setEditing(item); setForm({ ...initial, ...item }); setOpen(true); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: any) => {
    if (!window.confirm(`Excluir ${entityName.toLowerCase()} “${item.name}”?`)) return;
    try {
      await api(`${endpoint}/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível excluir");
    }
  };

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} action={<button className="primary-button" onClick={startNew}>+ Novo {entityName}</button>} />
      {error && <div className="alert error">{error}</div>}
      <div className="panel toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${entityName.toLowerCase()}...`} onKeyDown={(event) => event.key === "Enter" && void load()} /><button className="secondary-button" onClick={load}>Buscar</button></div>
      <div className="panel table-panel">
        {loading ? <Loading /> : items.length === 0 ? <EmptyState title={`Nenhum ${entityName.toLowerCase()} cadastrado`} text="Use o botão acima para criar o primeiro registro." /> : (
          <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Ações</th></tr></thead><tbody>{items.map((item) => (
            <tr key={item.id}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(item) : item[column.key] || "—"}</td>)}<td className="actions"><button onClick={() => startEdit(item)}>Editar</button><button className="danger-link" onClick={() => remove(item)}>Excluir</button></td></tr>
          ))}</tbody></table></div>
        )}
      </div>
      {open && <Modal title={`${editing ? "Editar" : "Novo"} ${entityName}`} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}>{fields.map((field) => (
        <Field key={field.key} label={field.label} wide={field.wide}>
          {field.type === "textarea" ? <textarea value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} required={field.required} /> : field.type === "select" ? <select value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type ?? "text"} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} required={field.required} />}
        </Field>
      ))}<div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div></form></Modal>}
    </>
  );
}

export const statusColumn = {
  key: "status",
  label: "Status",
  render: (item: any) => <Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "Ativo" : "Inativo"}</Badge>,
};
