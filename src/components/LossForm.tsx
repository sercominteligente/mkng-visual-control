import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Field } from "./UI";

const lossTypes = [
  ["operational", "Perda operacional"],
  ["setup", "Configuração / calibração"],
  ["human_error", "Erro humano"],
  ["material_defect", "Defeito do material"],
  ["scrap", "Sobra não reaproveitável"],
] as const;

const stages = [
  ["briefing", "Briefing"],
  ["design", "Criação / arte"],
  ["printing", "Impressão"],
  ["finishing", "Acabamento"],
  ["installation", "Instalação"],
  ["other", "Outra etapa"],
] as const;

const indivisibleUnits = new Set(["un", "chapa", "rolo", "lata", "kit", "pct"]);

export function LossForm({
  materials,
  orders = [],
  fixedOrderId = "",
  fixedOrderCode = "",
  onCancel,
  onSaved,
}: {
  materials: any[];
  orders?: any[];
  fixedOrderId?: string;
  fixedOrderCode?: string;
  onCancel: () => void;
  onSaved: (result: any) => Promise<void> | void;
}) {
  const firstMaterial = materials.find((item) => item.active !== 0) || materials[0];
  const [form, setForm] = useState<any>({
    order_id: fixedOrderId,
    material_id: firstMaterial?.id || "",
    loss_type: "operational",
    reason: "",
    stage: "printing",
    machine: "",
    quantity: 1,
    mode: "quantity",
    width_mm: 1000,
    height_mm: 1000,
    pieces: 1,
    requires_reprint: true,
    reprint_qty: 1,
    notes: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedMaterial = useMemo(() => materials.find((item) => item.id === form.material_id), [materials, form.material_id]);
  const calculatedArea = selectedMaterial?.unit === "m2" && form.mode === "dimensions"
    ? Math.round(((Number(form.width_mm || 0) / 1000) * (Number(form.height_mm || 0) / 1000) * Number(form.pieces || 1)) * 1000) / 1000
    : 0;
  const effectiveQty = selectedMaterial?.unit === "m2" && form.mode === "dimensions" ? calculatedArea : Number(form.quantity || 0);
  const step = indivisibleUnits.has(String(selectedMaterial?.unit)) ? 1 : 0.001;

  useEffect(() => {
    if (form.requires_reprint && selectedMaterial?.unit === "m2" && form.mode === "dimensions" && calculatedArea > 0) {
      setForm((current: any) => Number(current.reprint_qty) === calculatedArea ? current : { ...current, reprint_qty: calculatedArea });
    }
  }, [calculatedArea, form.mode, form.requires_reprint, selectedMaterial?.unit]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        order_id: fixedOrderId || form.order_id || null,
        reprint_qty: form.requires_reprint ? Number(form.reprint_qty || effectiveQty) : 0,
      };
      const result = await api<{ id: string; newStock: number; quantity: number; unit: string; reprint_qty: number }>("/losses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (photo) {
        const upload = new FormData();
        upload.set("file", photo);
        upload.set("entityType", "loss");
        upload.set("entityId", result.id);
        await api("/attachments", { method: "POST", body: upload });
      }
      await onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a perda");
    } finally {
      setSaving(false);
    }
  };

  return <form className="form-grid loss-form" onSubmit={save}>
    {error && <div className="alert error wide">{error}</div>}
    {fixedOrderId ? <Field label="Pedido / OS"><input disabled value={fixedOrderCode || fixedOrderId} /></Field> : <Field label="Pedido / OS"><select value={form.order_id} onChange={(event) => setForm({ ...form, order_id: event.target.value })}><option value="">Perda geral / sem pedido</option>{orders.filter((order) => !["completed", "cancelled"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.code} — {order.title}</option>)}</select></Field>}
    <Field label="Material"><select required value={form.material_id} onChange={(event) => { const material = materials.find((item) => item.id === event.target.value); setForm({ ...form, material_id: event.target.value, mode: "quantity", quantity: 1, reprint_qty: 1, width_mm: material?.width_mm || 1000, height_mm: material?.height_mm || 1000 }); }}>{materials.filter((material) => material.active !== 0).map((material) => <option key={material.id} value={material.id}>{material.name} — saldo {Number(material.current_stock).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {material.unit}</option>)}</select></Field>
    <Field label="Tipo de perda"><select value={form.loss_type} onChange={(event) => setForm({ ...form, loss_type: event.target.value })}>{lossTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Etapa"><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Motivo da perda" wide><input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ex.: cabeça da máquina encostou no adesivo" /></Field>
    {selectedMaterial?.unit === "m2" && <div className="consumption-mode wide"><button type="button" className={form.mode === "quantity" ? "active" : ""} onClick={() => setForm({ ...form, mode: "quantity" })}>Informar m²</button><button type="button" className={form.mode === "dimensions" ? "active" : ""} onClick={() => setForm({ ...form, mode: "dimensions" })}>Calcular por medidas</button></div>}
    {selectedMaterial?.unit === "m2" && form.mode === "dimensions" ? <div className="area-calculator wide"><label><span>Largura (mm)</span><input type="number" min="1" step="1" value={form.width_mm} onChange={(event) => setForm({ ...form, width_mm: Number(event.target.value) })} /></label><label><span>Altura (mm)</span><input type="number" min="1" step="1" value={form.height_mm} onChange={(event) => setForm({ ...form, height_mm: Number(event.target.value) })} /></label><label><span>Quantidade de peças</span><input type="number" min="1" step="1" value={form.pieces} onChange={(event) => setForm({ ...form, pieces: Number(event.target.value) })} /></label><div className="calculated-area"><span>Perda calculada</span><strong>{calculatedArea.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m²</strong></div></div> : <Field label={`Quantidade perdida (${selectedMaterial?.unit || "un"})`}><input type="number" required min={step} step={step} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value), reprint_qty: form.requires_reprint ? Number(event.target.value) : form.reprint_qty })} /></Field>}
    <Field label="Máquina / equipamento"><input value={form.machine} onChange={(event) => setForm({ ...form, machine: event.target.value })} placeholder="Ex.: Roland / Mimaki / Router" /></Field>
    <label className="check-field wide"><input type="checkbox" checked={form.requires_reprint} onChange={(event) => setForm({ ...form, requires_reprint: event.target.checked, reprint_qty: event.target.checked ? (effectiveQty || 1) : 0 })} /><span>Será necessária reimpressão / reposição deste material</span></label>
    {form.requires_reprint && <Field label={`Quantidade para reimpressão (${selectedMaterial?.unit || "un"})`}><input type="number" min={step} step={step} value={form.reprint_qty} onChange={(event) => setForm({ ...form, reprint_qty: Number(event.target.value) })} /></Field>}
    <Field label="Foto ou comprovante"><input type="file" accept="image/*,.pdf" onChange={(event) => setPhoto(event.target.files?.[0] || null)} /></Field>
    <Field label="Observações" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Detalhes adicionais, ação corretiva ou responsável técnico" /></Field>
    <div className="alert warning wide">Ao confirmar, a quantidade perdida será baixada imediatamente do estoque. Quando houver reimpressão, a quantidade informada será novamente reservada para o pedido.</div>
    <div className="form-actions wide"><button type="button" className="ghost-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving || effectiveQty <= 0}>{saving ? "Registrando..." : "Registrar perda"}</button></div>
  </form>;
}
