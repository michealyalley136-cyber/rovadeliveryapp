import React, { useEffect, useMemo, useState } from 'react';

import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../api/client';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const Menu = () => {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: '', sort_order: 0, is_active: true });
  const [itemForm, setItemForm] = useState({
    id: null,
    name: '',
    description: '',
    price: '',
    category_id: '',
    image_url: '',
    is_available: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({ category: false, item: false });
  const [uploading, setUploading] = useState(false);

  const loadVendors = async () => {
    try {
      const data = await apiGet('/admin/vendors');
      setVendors(data.vendors || []);
      if (!vendorId && data.vendors?.length) {
        setVendorId(String(data.vendors[0].id));
      }
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const loadMenu = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [catData, itemData] = await Promise.all([
        apiGet(`/admin/vendors/${id}/categories`),
        apiGet(`/admin/vendors/${id}/items`),
      ]);
      setCategories(catData.categories || []);
      setItems(itemData.items || []);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  useEffect(() => {
    loadMenu(vendorId);
  }, [vendorId]);

  const resetCategoryForm = () => setCategoryForm({ id: null, name: '', sort_order: 0, is_active: true });
  const resetItemForm = () =>
    setItemForm({ id: null, name: '', description: '', price: '', category_id: '', image_url: '', is_available: true });

  const saveCategory = async () => {
    if (!vendorId) return;
    if (!categoryForm.name.trim()) {
      toast({ type: 'error', message: 'Category name is required.' });
      return;
    }
    setSaving((s) => ({ ...s, category: true }));
    try {
      const payload = {
        id: categoryForm.id || undefined,
        name: categoryForm.name.trim(),
        sort_order: Number(categoryForm.sort_order || 0),
        is_active: Boolean(categoryForm.is_active),
      };
      if (categoryForm.id) {
        await apiPatch(`/admin/vendors/${vendorId}/categories`, payload);
        toast({ type: 'success', message: 'Category updated.' });
      } else {
        await apiPost(`/admin/vendors/${vendorId}/categories`, payload);
        toast({ type: 'success', message: 'Category created.' });
      }
      resetCategoryForm();
      loadMenu(vendorId);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setSaving((s) => ({ ...s, category: false }));
    }
  };

  const deleteCategory = async (id) => {
    if (!vendorId || !id) return;
    if (!window.confirm('Delete this category? Items will be uncategorized.')) return;
    try {
      await apiDelete(`/admin/vendors/${vendorId}/categories`, { id });
      loadMenu(vendorId);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const moveCategory = async (id, direction) => {
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const index = sorted.findIndex((c) => c.id === id);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const current = sorted[index];
    const target = sorted[targetIndex];
    await apiPatch(`/admin/vendors/${vendorId}/categories`, { id: current.id, sort_order: target.sort_order });
    await apiPatch(`/admin/vendors/${vendorId}/categories`, { id: target.id, sort_order: current.sort_order });
    loadMenu(vendorId);
  };

  const saveItem = async () => {
    if (!vendorId) return;
    if (!itemForm.name.trim()) {
      toast({ type: 'error', message: 'Item name is required.' });
      return;
    }
    if (!itemForm.price) {
      toast({ type: 'error', message: 'Price is required.' });
      return;
    }
    setSaving((s) => ({ ...s, item: true }));
    try {
      const payload = {
        id: itemForm.id || undefined,
        name: itemForm.name.trim(),
        description: itemForm.description?.trim() || null,
        price: Number(itemForm.price),
        category_id: itemForm.category_id ? Number(itemForm.category_id) : null,
        image_url: itemForm.image_url || null,
        is_available: Boolean(itemForm.is_available),
      };
      if (itemForm.id) {
        await apiPatch(`/admin/vendors/${vendorId}/items`, payload);
        toast({ type: 'success', message: 'Item updated.' });
      } else {
        await apiPost(`/admin/vendors/${vendorId}/items`, payload);
        toast({ type: 'success', message: 'Item created.' });
      }
      resetItemForm();
      loadMenu(vendorId);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setSaving((s) => ({ ...s, item: false }));
    }
  };

  const deleteItem = async (id) => {
    if (!vendorId || !id) return;
    if (!window.confirm('Delete this item?')) return;
    try {
      await apiDelete(`/admin/vendors/${vendorId}/items`, { id });
      loadMenu(vendorId);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const toggleItemAvailability = async (item) => {
    if (!vendorId) return;
    try {
      await apiPatch(`/admin/vendors/${vendorId}/items`, {
        id: item.id,
        is_available: !item.is_available,
      });
      loadMenu(vendorId);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = await apiUpload('/admin/uploads', file);
      const url = data.url || '';
      setItemForm((prev) => ({ ...prev, image_url: url }));
      toast({ type: 'success', message: 'Image uploaded.' });
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setUploading(false);
    }
  };

  const vendorOptions = useMemo(
    () => vendors.map((v) => ({ id: v.id, name: v.name })),
    [vendors]
  );

  return (
    <div className="space-y-6">
      <Topbar title="Menu Management" />
      <div className="rova-card glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-400">Vendor</div>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
          >
            {vendorOptions.map((v) => (
              <option className="bg-slate-900" key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {loading && <span className="text-xs text-slate-400">Loading menu…</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="text-sm font-semibold">Categories</div>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{cat.name}</div>
                    <div className="text-xs text-slate-400">
                      Sort {cat.sort_order} • {cat.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveCategory(cat.id, 'up')}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveCategory(cat.id, 'down')}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setCategoryForm(cat)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="text-xs text-slate-400">No categories yet.</div>
            )}
          </div>
          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="text-xs text-slate-400">
              {categoryForm.id ? 'Edit category' : 'New category'}
            </div>
            <input
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Category name"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                placeholder="Sort order"
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
              <select
                value={categoryForm.is_active ? 'yes' : 'no'}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, is_active: e.target.value === 'yes' }))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              >
                <option className="bg-slate-900" value="yes">Active</option>
                <option className="bg-slate-900" value="no">Inactive</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveCategory}
                disabled={saving.category}
                className="btn-primary rounded-lg px-3 py-1.5 text-xs"
              >
                {saving.category ? 'Saving…' : categoryForm.id ? 'Update' : 'Create'}
              </button>
              {categoryForm.id && (
                <button
                  onClick={resetCategoryForm}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="text-sm font-semibold">Items</div>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-slate-400">
                      {item.category || 'Uncategorized'} • GHS {item.price_ghs?.toFixed(2) ?? '-'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleItemAvailability(item)}
                      className={`rounded-lg border px-2 py-1 text-xs ${
                        item.is_available ? 'border-emerald-400/60 text-emerald-200' : 'border-white/10 text-slate-300'
                      }`}
                    >
                      {item.is_available ? 'Available' : 'Hidden'}
                    </button>
                    <button
                      onClick={() =>
                        setItemForm({
                          id: item.id,
                          name: item.name,
                          description: item.description || '',
                          price: item.price_ghs ?? '',
                          category_id: item.category_id ?? '',
                          image_url: item.image_url || '',
                          is_available: item.is_available,
                        })
                      }
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-xs text-slate-400">No items yet.</div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="text-xs text-slate-400">
              {itemForm.id ? 'Edit item' : 'New item'}
            </div>
            <input
              value={itemForm.name}
              onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Item name"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
            <textarea
              value={itemForm.description}
              onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={itemForm.price}
                onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="Price (GHS)"
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
              <select
                value={itemForm.category_id}
                onChange={(e) => setItemForm((prev) => ({ ...prev, category_id: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              >
                <option className="bg-slate-900" value="">
                  Uncategorized
                </option>
                {categories.map((cat) => (
                  <option className="bg-slate-900" key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Image URL</div>
                <input
                  value={itemForm.image_url}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://..."
                  className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                />
              </div>
              <div>
                <div className="text-xs text-slate-400">Upload image</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                  className="mt-2 w-full text-xs text-slate-300"
                />
                {uploading && <div className="text-xs text-slate-400">Uploading…</div>}
              </div>
            </div>
            <select
              value={itemForm.is_available ? 'yes' : 'no'}
              onChange={(e) => setItemForm((prev) => ({ ...prev, is_available: e.target.value === 'yes' }))}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            >
              <option className="bg-slate-900" value="yes">Available</option>
              <option className="bg-slate-900" value="no">Hidden</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={saveItem}
                disabled={saving.item}
                className="btn-primary rounded-lg px-3 py-1.5 text-xs"
              >
                {saving.item ? 'Saving…' : itemForm.id ? 'Update item' : 'Create item'}
              </button>
              {itemForm.id && (
                <button
                  onClick={resetItemForm}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu;
