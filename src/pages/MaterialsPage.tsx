import { useEffect, useMemo, useState } from "react";
import { ApiError, api, brl } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader, StatCard } from "../components/UI";
import type { User } from "../components/Layout";

type MaterialProfile = "sheet" | "roll" | "paint" | "general";

type MaterialForm = {
  category_id: string;
  sku: string;
  name: string;
  description: string;
  unit: string;
  material_type: MaterialProfile;
  thickness_mm: string | number;
  width_mm: string | number;
  height_mm: string | number;
  grammage_gsm: string | number;
  length_m: string | number;
  volume_l: string | number;
  color: string;
  finish: string;
  package_size: string;
  current_stock: string | number;
  minimum_stock: string | number;
  average_cost: string | number;
  location: string;
  active: boolean;
};

type CategoryForm = {
  name: string;
  code: string;
  description: string;
  sort_order: string | number;
  active: boolean;
};

const blankMaterial: MaterialForm = {
  category_id: "",
  sku: "",
  name: "",
  description: "",
  unit: "un",
  material_type: "general",
  thickness_mm: "",
  width_mm: "",
  height_mm: "",
  grammage_gsm: "",
  length_m: "",
  volume_l: "",
  color: "",
  finish: "",
  package_size: "",
  current_stock: 0,
  minimum_stock: 0,
  average_cost: 0,
  location: "",
  active: true,
};

const blankCategory: CategoryForm = {
  name: "",
  code: "",
  description: "",
  sort_order: 0,
  active: true,
};

const unitLabels: Record<string, { singular: string; plural: string }> = {
  un: { singular: "unidade", plural: "unidades" },
  chapa: { singular: "chapa", plural: "chapas" },
  m: { singular: "metro", plural: "metros" },
  m2: { singular: "m²", plural: "m²" },
  l: { singular: "litro", plural: "litros" },
  ml: { singular: "mililitro", plural: "mililitros" },
  kg: { singular: "kg", plural: "kg" },
  rolo: { singular: "rolo", plural: "rolos" },
  lata: { singular: "lata", plural: "latas" },
  kit: { singular: "kit", plural: "kits" },
  pct: { singular: "pacote", plural: "pacotes" },
};

const profileLabels: Record<MaterialProfile, string> = {
  sheet: "Chapa ou placa",
  roll: "Rolo ou mídia flexível",
  paint: "Tinta ou líquido",
  general: "Insumo geral",
};

function numberBR(value: unknown, maximumFractionDigits = 3): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits, minimumFractionDigits: 0 });
}

function formatQuantity(value: unknown, unit: string): string {
  const quantity = Number(value ?? 0);
  const labels = unitLabels[unit] ?? { singular: unit || "un", plural: unit || "un" };
  const label = Math.abs(quantity) === 1 ? labels.singular : labels.plural;
  return `${numberBR(quantity)} ${label}`;
}

function formatSpecifications(item: any): string {
  const type = (item.material_type || "general") as MaterialProfile;
  if (type === "sheet") {
    const parts = [item.width_mm, item.height_mm].filter((value) => Number(value) > 0).map((value) => numberBR(value));
    const base = parts.length ? `${parts.join(" × ")} mm` : "Dimensões não informadas";
    return Number(item.thickness_mm) > 0 ? `${base} × ${numberBR(item.thickness_mm)} mm` : base;
  }
  if (type === "roll") {
    const size = [
      Number(item.width_mm) > 0 ? `${numberBR(item.width_mm)} mm` : "",
      Number(item.length_m) > 0 ? `${numberBR(item.length_m)} m` : "",
    ].filter(Boolean).join(" × ");
    const details = [
      Number(item.grammage_gsm) > 0 ? `${numberBR(item.grammage_gsm)} g/m²` : "",
      item.finish || "",
    ].filter(Boolean).join(" · ");
    return [size || "Dimensões não informadas", details].filter(Boolean).join(" · ");
  }
  if (type === "paint") {
    return [
      Number(item.volume_l) > 0 ? `${numberBR(item.volume_l)} L` : "",
      item.color || "",
      item.package_size || "",
    ].filter(Boolean).join(" · ") || "Especificações não informadas";
  }
  return item.package_size || "—";
}

function clearTechnicalFields(form: MaterialForm, type: MaterialProfile): MaterialForm {
  return {
    ...form,
    material_type: type,
    thickness_mm: type === "sheet" ? form.thickness_mm : "",
    width_mm: type === "sheet" || type === "roll" ? form.width_mm : "",
    height_mm: type === "sheet" ? form.height_mm : "",
    grammage_gsm: type === "roll" ? form.grammage_gsm : "",
    length_m: type === "roll" ? form.length_m : "",
    volume_l: type === "paint" ? form.volume_l : "",
    color: type === "paint" ? form.color : "",
    finish: type === "roll" ? form.finish : "",
    package_size: type === "paint" || type === "general" ? form.package_size : "",
  };
}

export function MaterialsPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<MaterialForm>(blankMaterial);
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [quickCategorySaving, setQuickCategorySaving] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<any>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(blankCategory);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar estoque");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeItems = items.filter((item) => Boolean(item.active));
  const low = activeItems.filter((item) => Number(item.current_stock) - Number(item.reserved_stock || 0) <= Number(item.minimum_stock)).length;
  const value = activeItems.reduce((sum, item) => sum + Number(item.current_stock) * Number(item.average_cost), 0);

  const selectableCategories = useMemo(() => {
    const normalized = categoryFilter.trim().toLocaleLowerCase("pt-BR");
    return categories.filter((category) => {
      const isSelected = category.id === form.category_id;
      const isActive = Boolean(category.active);
      const matches = !normalized || `${category.name} ${category.code || ""}`.toLocaleLowerCase("pt-BR").includes(normalized);
      return (isActive || isSelected) && matches;
    });
  }, [categories, categoryFilter, form.category_id]);

  const startNew = () => {
    const firstCategory = categories.find((category) => Boolean(category.active));
    setEditing(null);
    setForm({ ...blankMaterial, category_id: firstCategory?.id ?? "" });
    setCategoryFilter("");
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    setOpen(true);
  };

  const startEdit = (item: any) => {
    setEditing(item);
    setForm({
      ...blankMaterial,
      ...item,
      material_type: (item.material_type || "general") as MaterialProfile,
      active: Boolean(item.active),
    });
    setCategoryFilter("");
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(editing ? `/materials/${editing.id}` : "/materials", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      setOpen(false);
      setNotice(editing ? "Material atualizado com sucesso." : "Material cadastrado com sucesso.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  const createQuickCategory = async () => {
    const name = quickCategoryName.trim();
    if (!name) return;
    setQuickCategorySaving(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/material-categories", {
        method: "POST",
        body: JSON.stringify({ name, active: true, sort_order: categories.length * 10 + 10 }),
      });
      const categoryData = await api<{ items: any[] }>("/material-categories");
      setCategories(categoryData.items);
      setForm({ ...form, category_id: created.id });
      setQuickCategoryName("");
      setQuickCategoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a categoria");
    } finally {
      setQuickCategorySaving(false);
    }
  };

  const removeMaterial = async (item: any) => {
    const confirmation = window.prompt(`Excluir definitivamente “${item.name}”?\n\nSerão removidos o cadastro, vínculos com pedidos/compras e movimentações deste material. Digite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    setError(""); setNotice("");
    try {
      await api(`/materials/${item.id}`, { method: "DELETE" });
      setNotice(`Material “${item.name}” excluído definitivamente.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o material");
    }
  };

  const openCategoryManager = () => {
    setCategoryEditing(null);
    setCategoryForm({ ...blankCategory, sort_order: categories.length * 10 + 10 });
    setCategoryError("");
    setCategoryManagerOpen(true);
  };

  const startCategoryEdit = (category: any) => {
    setCategoryEditing(category);
    setCategoryForm({
      name: category.name || "",
      code: category.code || "",
      description: category.description || "",
      sort_order: category.sort_order ?? 0,
      active: Boolean(category.active),
    });
    setCategoryError("");
  };

  const resetCategoryForm = () => {
    setCategoryEditing(null);
    setCategoryForm({ ...blankCategory, sort_order: categories.length * 10 + 10 });
    setCategoryError("");
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setCategorySaving(true);
    setCategoryError("");
    try {
      await api(categoryEditing ? `/material-categories/${categoryEditing.id}` : "/material-categories", {
        method: categoryEditing ? "PUT" : "POST",
        body: JSON.stringify(categoryForm),
      });
      const categoryData = await api<{ items: any[] }>("/material-categories");
      setCategories(categoryData.items);
      resetCategoryForm();
      setNotice(categoryEditing ? "Categoria atualizada." : "Categoria criada.");
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Não foi possível salvar a categoria");
    } finally {
      setCategorySaving(false);
    }
  };

  const removeCategory = async (category: any) => {
    const confirmation = window.prompt(`Excluir definitivamente a categoria “${category.name}”?\n\nOs materiais vinculados ficarão sem categoria. Digite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    setCategoryError("");
    try {
      await api(`/material-categories/${category.id}`, { method: "DELETE" });
      const categoryData = await api<{ items: any[] }>("/material-categories");
      setCategories(categoryData.items);
      setNotice(`Categoria “${category.name}” excluída definitivamente.`);
      if (categoryEditing?.id === category.id) resetCategoryForm();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Não foi possível excluir a categoria");
    }
  };

  return <>
    <PageHeader
      eyebrow="ESTOQUE E MATERIAIS"
      title="Chapas, tintas e insumos"
      description="Controle de saldo, estoque mínimo, custo médio, especificações técnicas e localização."
      action={<div className="header-actions"><button className="secondary-button" onClick={openCategoryManager}>Gerenciar categorias</button><button className="primary-button" onClick={startNew}>+ Novo material</button></div>}
    />
    <div className="stats-grid four">
      <StatCard label="Materiais ativos" value={activeItems.length} />
      <StatCard label="Estoque crítico" value={low} tone={low ? "red" : "green"} />
      <StatCard label="Valor estimado" value={brl(value)} tone="green" />
      <StatCard label="Categorias" value={categories.filter((category) => Boolean(category.active)).length} tone="purple" />
    </div>
    {notice && <div className="alert success">{notice}</div>}
    {error && <div className="alert error">{error}</div>}
    <div className="panel toolbar">
      <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="Buscar por material, SKU ou categoria..." />
      <button className="secondary-button" onClick={load}>Buscar</button>
    </div>
    <div className="panel table-panel">
      {loading ? <Loading /> : items.length === 0 ? <EmptyState title="Estoque ainda vazio" text="Cadastre chapas, lonas, tintas e demais insumos." /> : <div className="table-wrap"><table><thead><tr><th>Material</th><th>Categoria</th><th>Especificações</th><th>Saldo</th><th>Reservado</th><th>Disponível</th><th>Mínimo</th><th>Custo médio</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((item) => {
        const available = Number(item.current_stock) - Number(item.reserved_stock || 0);
        const critical = available <= Number(item.minimum_stock);
        const active = Boolean(item.active);
        return <tr key={item.id} className={!active ? "row-inactive" : ""}>
          <td><strong>{item.name}</strong><small className="cell-sub">{item.sku || "SKU automático"} · {item.location || "Sem localização"}</small><small className="cell-sub">{profileLabels[(item.material_type || "general") as MaterialProfile]}</small></td>
          <td>{item.category_name || "Sem categoria"}</td>
          <td>{formatSpecifications(item)}</td>
          <td>{formatQuantity(item.current_stock, item.unit)}</td>
          <td>{formatQuantity(item.reserved_stock || 0, item.unit)}</td>
          <td><strong className={available < 0 ? "text-red" : "text-green"}>{formatQuantity(available, item.unit)}</strong></td>
          <td>{formatQuantity(item.minimum_stock, item.unit)}</td>
          <td>{brl(item.average_cost)}</td>
          <td>{!active ? <Badge>Desativado</Badge> : <Badge tone={critical ? "danger" : "success"}>{critical ? "Crítico" : "OK"}</Badge>}</td>
          <td className="actions"><button onClick={() => startEdit(item)}>Editar</button>{user.role === "super_admin" && <button className="action-danger" onClick={() => void removeMaterial(item)}>Excluir definitivamente</button>}</td>
        </tr>;
      })}</tbody></table></div>}
    </div>

    {open && <Modal title={editing ? "Editar material" : "Novo material"} onClose={() => setOpen(false)} width={900}>
      <form className="form-grid" onSubmit={save}>
        <div className="field wide">
          <span>Categoria</span>
          <div className="category-picker">
            <input type="search" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="Filtrar categorias cadastradas..." />
            <select required value={form.category_id || ""} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
              <option value="">Selecione uma categoria</option>
              {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? " (desativada)" : ""}</option>)}
            </select>
            <button type="button" className="secondary-button" onClick={() => setQuickCategoryOpen(!quickCategoryOpen)}>+ Nova categoria</button>
          </div>
          {quickCategoryOpen && <div className="inline-create-category"><input value={quickCategoryName} onChange={(event) => setQuickCategoryName(event.target.value)} placeholder="Nome da nova categoria" /><button type="button" className="primary-button" disabled={quickCategorySaving || !quickCategoryName.trim()} onClick={() => void createQuickCategory()}>{quickCategorySaving ? "Criando..." : "Criar e selecionar"}</button></div>}
        </div>
        <Field label="SKU"><input value={form.sku || ""} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="Deixe vazio para gerar automaticamente" /><small className="muted">O sistema cria um código único quando este campo fica vazio.</small></Field>
        <Field label="Perfil técnico"><select value={form.material_type} onChange={(event) => setForm(clearTechnicalFields(form, event.target.value as MaterialProfile))}><option value="sheet">Chapa ou placa</option><option value="roll">Rolo ou mídia flexível</option><option value="paint">Tinta ou líquido</option><option value="general">Insumo geral</option></select></Field>
        <Field label="Nome do material" wide><input required value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Lona 280 g" /></Field>
        <Field label="Descrição" wide><textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label="Unidade de estoque"><select value={form.unit || "un"} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option value="un">Unidade</option><option value="chapa">Chapa</option><option value="rolo">Rolo</option><option value="lata">Lata</option><option value="m">Metro</option><option value="m2">Metro²</option><option value="l">Litro</option><option value="ml">Mililitro</option><option value="kg">Quilograma</option><option value="pct">Pacote</option><option value="kit">Kit</option></select></Field>
        <div className="field"><span>Orientação do cadastro</span><div className="type-hint">{form.material_type === "sheet" && "Informe largura, altura e espessura em milímetros."}{form.material_type === "roll" && "Para lona 280 g: largura 1.600 mm, comprimento 50 m e gramatura 280 g/m²."}{form.material_type === "paint" && "Informe cor, volume e tipo de embalagem."}{form.material_type === "general" && "Use este perfil para ferramentas, acessórios e itens sem dimensão técnica."}</div></div>

        {form.material_type === "sheet" && <>
          <Field label="Espessura (mm)"><input type="number" min="0" step="0.01" value={form.thickness_mm} onChange={(event) => setForm({ ...form, thickness_mm: event.target.value })} /></Field>
          <Field label="Largura (mm)"><input type="number" min="0" step="0.01" value={form.width_mm} onChange={(event) => setForm({ ...form, width_mm: event.target.value })} /></Field>
          <Field label="Altura (mm)"><input type="number" min="0" step="0.01" value={form.height_mm} onChange={(event) => setForm({ ...form, height_mm: event.target.value })} /></Field>
        </>}

        {form.material_type === "roll" && <>
          <Field label="Gramatura (g/m²)"><input type="number" min="0" step="0.01" value={form.grammage_gsm} onChange={(event) => setForm({ ...form, grammage_gsm: event.target.value })} placeholder="Ex.: 280" /></Field>
          <Field label="Largura (mm)"><input type="number" min="0" step="0.01" value={form.width_mm} onChange={(event) => setForm({ ...form, width_mm: event.target.value })} placeholder="Ex.: 1600" /></Field>
          <Field label="Comprimento do rolo (m)"><input type="number" min="0" step="0.01" value={form.length_m} onChange={(event) => setForm({ ...form, length_m: event.target.value })} placeholder="Ex.: 50" /></Field>
          <Field label="Acabamento"><input value={form.finish} onChange={(event) => setForm({ ...form, finish: event.target.value })} placeholder="Ex.: Fosca, brilho, blackout" /></Field>
        </>}

        {form.material_type === "paint" && <>
          <Field label="Cor"><input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} placeholder="Ex.: Ciano" /></Field>
          <Field label="Volume por embalagem (L)"><input type="number" min="0" step="0.001" value={form.volume_l} onChange={(event) => setForm({ ...form, volume_l: event.target.value })} placeholder="Ex.: 3.6" /></Field>
          <Field label="Embalagem"><input value={form.package_size} onChange={(event) => setForm({ ...form, package_size: event.target.value })} placeholder="Ex.: Lata 3,6 L" /></Field>
        </>}

        {form.material_type === "general" && <Field label="Apresentação / embalagem"><input value={form.package_size} onChange={(event) => setForm({ ...form, package_size: event.target.value })} placeholder="Ex.: Caixa com 100 unidades" /></Field>}

        {!editing && <Field label="Saldo inicial"><input type="number" step="0.001" value={form.current_stock} onChange={(event) => setForm({ ...form, current_stock: event.target.value })} /><small className="muted">Use apenas para o saldo existente na implantação. Compras futuras entram pelo módulo Entradas / Compras.</small></Field>}
        <Field label="Estoque mínimo"><input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={(event) => setForm({ ...form, minimum_stock: event.target.value })} /></Field>
        <Field label="Custo médio"><input type="number" min="0" step="0.01" value={form.average_cost} onChange={(event) => setForm({ ...form, average_cost: event.target.value })} /></Field>
        <Field label="Localização"><input value={form.location || ""} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Ex.: Galpão · Prateleira A2" /></Field>
        {editing && <label className="check-field wide"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Material ativo e disponível para novos pedidos e compras</span></label>}
        <div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar material"}</button></div>
      </form>
    </Modal>}

    {categoryManagerOpen && <Modal title="Categorias de materiais" onClose={() => setCategoryManagerOpen(false)} width={980}>
      <div className="category-manager-grid">
        <form className="category-editor" onSubmit={saveCategory}>
          <div className="subform-head"><div><strong>{categoryEditing ? "Editar categoria" : "Nova categoria"}</strong><small className="muted">Crie quantas categorias a operação precisar.</small></div>{categoryEditing && <button type="button" className="ghost-button" onClick={resetCategoryForm}>Nova</button>}</div>
          <Field label="Nome"><input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Ex.: Lonas" /></Field>
          <Field label="Código interno"><input value={categoryForm.code} onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value })} placeholder="Gerado automaticamente" /></Field>
          <Field label="Descrição"><textarea value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></Field>
          <Field label="Ordem de exibição"><input type="number" value={categoryForm.sort_order} onChange={(event) => setCategoryForm({ ...categoryForm, sort_order: event.target.value })} /></Field>
          <label className="check-field"><input type="checkbox" checked={categoryForm.active} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.checked })} /><span>Categoria ativa</span></label>
          {categoryError && <div className="alert error">{categoryError}</div>}
          <button className="primary-button full" disabled={categorySaving}>{categorySaving ? "Salvando..." : categoryEditing ? "Atualizar categoria" : "Criar categoria"}</button>
        </form>
        <div className="category-list-panel">
          <div className="subform-head"><div><strong>Categorias cadastradas</strong><small className="muted">Categorias em uso devem ser desativadas ou ter seus materiais transferidos.</small></div></div>
          <div className="category-list">{categories.map((category) => <div className="category-list-item" key={category.id}>
            <div><strong>{category.name}</strong><small>{category.code || "Sem código"} · ordem {category.sort_order ?? 0}</small>{category.description && <p>{category.description}</p>}</div>
            <Badge tone={category.active ? "success" : "neutral"}>{category.active ? "Ativa" : "Desativada"}</Badge>
            <div className="actions"><button onClick={() => startCategoryEdit(category)}>Editar</button>{user.role === "super_admin" && <button className="action-danger" onClick={() => void removeCategory(category)}>Excluir definitivamente</button>}</div>
          </div>)}</div>
        </div>
      </div>
    </Modal>}
  </>;
}
