import { useEffect, useMemo, useState } from "react";
import { api, brl, dateBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader, StatCard } from "../components/UI";
import type { User } from "../components/Layout";

const paymentMethods = [
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Espécie" },
  { value: "card", label: "Cartão" },
  { value: "transfer", label: "Transferência" },
];

const methodLabel = (value: string) => paymentMethods.find((item) => item.value === value)?.label || "—";
const statusLabel = (value: string) => ({ pending: "Pendente", partial: "Parcialmente pago", paid: "Pago", overdue: "Vencido", cancelled: "Cancelado" } as Record<string, string>)[value] || value;
const statusTone = (value: string) => value === "paid" ? "success" : value === "overdue" || value === "cancelled" ? "danger" : value === "partial" ? "info" : "warning";

function emptyForm(kind: "receivable" | "payable") {
  return {
    kind,
    description: "",
    amount: 0,
    due_date: "",
    balance_due_date: "",
    customer_id: "",
    supplier_id: "",
    received_amount: 0,
    payment_method: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_reference: "",
    status: "pending",
    notes: "",
  };
}

export function FinancePage({ user }: { user: User }) {
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>(emptyForm("receivable"));
  const [payment, setPayment] = useState<any>({ amount: 0, payment_method: "pix", payment_date: new Date().toISOString().slice(0, 10), reference: "", notes: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [finance, clientData, supplierData] = await Promise.all([
        api<{ items: any[] }>(`/finance?kind=${kind}`),
        api<{ items: any[] }>("/customers"),
        api<{ items: any[] }>("/suppliers"),
      ]);
      setItems(finance.items);
      setCustomers(clientData.items);
      setSuppliers(supplierData.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar financeiro");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [kind]);

  const totals = useMemo(() => {
    if (kind === "receivable") {
      return {
        open: items.reduce((sum, item) => sum + Number(item.balance_amount ?? Math.max(Number(item.amount) - Number(item.received_amount || 0), 0)), 0),
        paid: items.reduce((sum, item) => sum + Number(item.received_amount || 0), 0),
      };
    }
    return {
      open: items.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Number(item.amount), 0),
      paid: items.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0),
    };
  }, [items, kind]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api("/finance", { method: "POST", body: JSON.stringify({ ...form, kind, due_date: kind === "receivable" ? form.balance_due_date : form.due_date }) });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o lançamento");
    }
  };

  const markPaid = async (item: any) => {
    try {
      await api(`/finance/${kind}/${item.id}`, { method: "PUT", body: JSON.stringify({ ...item, status: "paid" }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o lançamento");
    }
  };

  const startPayment = (item: any) => {
    const balance = Number(item.balance_amount ?? Math.max(Number(item.amount) - Number(item.received_amount || 0), 0));
    setPayment({ amount: balance, payment_method: item.payment_method || "pix", payment_date: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
    setPaying(item);
  };

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying) return;
    try {
      await api(`/finance/receivable/${paying.id}/payments`, { method: "POST", body: JSON.stringify(payment) });
      setPaying(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o pagamento");
    }
  };

  const remove = async (item: any) => {
    const confirmation = window.prompt(`Excluir definitivamente o lançamento “${item.description}”?\n\nDigite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    try {
      await api(`/finance/${kind}/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o lançamento");
    }
  };

  const receipt = (item: any) => window.open(`/api/finance/receivable/${item.id}/receipt.pdf?v=${Date.now()}`, "_blank", "noopener,noreferrer");

  return <>
    <PageHeader
      eyebrow="CONTROLE FINANCEIRO"
      title="Contas a receber e pagar"
      description="Acompanhamento financeiro conectado a pedidos, compras, clientes e fornecedores."
      action={<button className="primary-button" onClick={() => { setForm(emptyForm(kind)); setOpen(true); }}>+ Novo lançamento</button>}
    />
    {error && <div className="alert error">{error}</div>}
    <div className="filter-tabs standalone">
      <button className={kind === "receivable" ? "active" : ""} onClick={() => setKind("receivable")}>Contas a receber</button>
      <button className={kind === "payable" ? "active" : ""} onClick={() => setKind("payable")}>Contas a pagar</button>
    </div>
    <div className="stats-grid three">
      <StatCard label={kind === "receivable" ? "Saldo a receber" : "Em aberto"} value={brl(totals.open)} tone={kind === "receivable" ? "green" : "red"} />
      <StatCard label={kind === "receivable" ? "Recebido" : "Liquidadas"} value={brl(totals.paid)} tone="purple" />
      <StatCard label="Lançamentos" value={items.length} />
    </div>
    <div className="panel table-panel">
      {loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhum lançamento" text="Cadastre contas a receber ou a pagar." /> : <div className="table-wrap"><table>
        <thead><tr>
          <th>Descrição</th><th>{kind === "receivable" ? "Cliente" : "Fornecedor"}</th><th>Vencimento</th><th>Valor total</th>
          {kind === "receivable" && <><th>Recebido</th><th>Saldo</th><th>Forma</th></>}
          <th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>{items.map((item) => {
          const balance = Number(item.balance_amount ?? Math.max(Number(item.amount) - Number(item.received_amount || 0), 0));
          return <tr key={item.id}>
            <td><strong>{item.description}</strong><small className="cell-sub">{item.notes || ""}</small></td>
            <td>{item.party_name || "—"}</td>
            <td>{dateBR(item.balance_due_date || item.due_date)}</td>
            <td>{brl(item.amount)}</td>
            {kind === "receivable" && <><td>{brl(item.received_amount || 0)}</td><td>{brl(balance)}</td><td>{methodLabel(item.payment_method)}</td></>}
            <td><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></td>
            <td className="actions">
              {kind === "receivable" && balance > 0 && item.status !== "cancelled" && <button onClick={() => startPayment(item)}>Registrar pagamento</button>}
              {kind === "receivable" && Number(item.received_amount || 0) > 0 && <button onClick={() => receipt(item)}>Recibo PDF</button>}
              {kind === "payable" && item.status !== "paid" && <button onClick={() => void markPaid(item)}>Marcar pago</button>}
              {user.role === "super_admin" && <button className="action-danger" onClick={() => void remove(item)}>Excluir definitivamente</button>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>

    {open && <Modal title={kind === "receivable" ? "Nova conta a receber" : "Nova conta a pagar"} onClose={() => setOpen(false)}>
      <form className="form-grid" onSubmit={save}>
        <Field label="Descrição" wide><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        {kind === "receivable" ? <Field label="Cliente"><select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">Selecione...</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : <Field label="Fornecedor"><select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}><option value="">Selecione...</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
        <Field label="Valor total"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field>
        {kind === "receivable" ? <>
          <Field label="Entrada / sinal"><input type="number" min="0" max={Number(form.amount || 0)} step="0.01" value={form.received_amount} onChange={(event) => setForm({ ...form, received_amount: event.target.value })} /></Field>
          <Field label="Forma de pagamento"><select value={form.payment_method} required={Number(form.received_amount) > 0} onChange={(event) => setForm({ ...form, payment_method: event.target.value })}><option value="">Selecione...</option>{paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Data da entrada"><input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} /></Field>
          <Field label="Vencimento do saldo"><input type="date" value={form.balance_due_date} onChange={(event) => setForm({ ...form, balance_due_date: event.target.value })} /></Field>
          <Field label="Referência do pagamento"><input value={form.payment_reference} onChange={(event) => setForm({ ...form, payment_reference: event.target.value })} placeholder="Ex.: comprovante PIX, autorização do cartão" /></Field>
          <div className="detail-card"><span>Saldo restante</span><strong>{brl(Math.max(Number(form.amount || 0) - Number(form.received_amount || 0), 0))}</strong></div>
        </> : <Field label="Vencimento"><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field>}
        <Field label="Observações" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        <div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Salvar lançamento</button></div>
      </form>
    </Modal>}

    {paying && <Modal title={`Registrar pagamento — ${paying.description}`} onClose={() => setPaying(null)}>
      <form className="form-grid" onSubmit={savePayment}>
        <div className="detail-card"><span>Saldo atual</span><strong>{brl(paying.balance_amount ?? Math.max(Number(paying.amount) - Number(paying.received_amount || 0), 0))}</strong></div>
        <Field label="Valor recebido"><input type="number" min="0.01" max={Number(paying.balance_amount ?? paying.amount)} step="0.01" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field>
        <Field label="Forma de pagamento"><select required value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })}>{paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <Field label="Data do pagamento"><input type="date" required value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} /></Field>
        <Field label="Referência"><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Ex.: código PIX ou autorização" /></Field>
        <Field label="Observações" wide><textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} /></Field>
        <div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setPaying(null)}>Cancelar</button><button className="primary-button">Confirmar recebimento</button></div>
      </form>
    </Modal>}
  </>;
}
