import { SimpleCrudPage, statusColumn } from "./SimpleCrudPage";

export function CustomersPage() {
  return <SimpleCrudPage title="Clientes" eyebrow="CADASTROS" description="Base de clientes vinculada aos pedidos, contas a receber e relatórios." endpoint="/customers" entityName="Cliente" fields={[
    { key: "name", label: "Nome / Razão social", required: true },
    { key: "document", label: "CPF / CNPJ" },
    { key: "contact_name", label: "Contato principal" },
    { key: "phone", label: "Telefone", type: "tel" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }] },
    { key: "address", label: "Endereço", wide: true },
    { key: "notes", label: "Observações", type: "textarea", wide: true },
  ]} columns={[
    { key: "name", label: "Cliente" },
    { key: "document", label: "Documento" },
    { key: "contact_name", label: "Contato" },
    { key: "phone", label: "Telefone" },
    statusColumn,
  ]} />;
}
