import { SimpleCrudPage, statusColumn } from "./SimpleCrudPage";
import type { User } from "../components/Layout";

export function SuppliersPage({ user }: { user: User }) {
  return <SimpleCrudPage user={user} title="Fornecedores" eyebrow="COMPRAS E SUPRIMENTOS" description="Cadastro de fornecedores para compras, entradas e contas a pagar." endpoint="/suppliers" entityName="Fornecedor" fields={[
    { key: "name", label: "Nome / Razão social", required: true },
    { key: "document", label: "CPF / CNPJ" },
    { key: "contact_name", label: "Contato principal" },
    { key: "phone", label: "Telefone", type: "tel" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }] },
    { key: "address", label: "Endereço", wide: true },
    { key: "notes", label: "Observações", type: "textarea", wide: true },
  ]} columns={[
    { key: "name", label: "Fornecedor" },
    { key: "document", label: "Documento" },
    { key: "contact_name", label: "Contato" },
    { key: "phone", label: "Telefone" },
    statusColumn,
  ]} />;
}
