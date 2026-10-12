/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Minus,
  Save,
  RotateCcw,
  Edit2,
  Trash2,
  Receipt,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Printer,
  Copy,
  Share2,
  Download,
  Calendar,
  Wallet,
  QrCode,
  DollarSign
} from 'lucide-react';

interface Order {
  number: number;
  customer: string;
  items: string;
  total: number;
  itemsCount: number;
  lelePrice: number;
  paymentMethod: 'Cash' | 'QRIS';
  createdAt: string;
}

interface MenuDef {
  id: number;
  name: string;
  price: number;
  icon: string;
  isManualPrice?: boolean;
}

const MENU_LIST: MenuDef[] = [
  { id: 0, name: 'Ayam', price: 21000, icon: '🍗' },
  { id: 1, name: 'Nasi', price: 6000, icon: '🍚' },
  { id: 2, name: 'Tahu / Tempe', price: 5000, icon: '🥢' },
  { id: 3, name: 'Ampela', price: 10000, icon: '🍢' },
  { id: 4, name: 'Lele', price: 0, icon: '🐟', isManualPrice: true },
];

const STORAGE_KEY = 'kasir_pesanan_v3';
const OLD_STORAGE_KEY = 'kasir_pesanan_v2';

// Helper format rupiah
const formatMoney = (val: number | string): string => {
  const num = Number(val) || 0;
  return 'Rp' + new Intl.NumberFormat('id-ID').format(num);
};

// Helper format date time
const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
};

// Parse qty array from string "🍗 Ayam × 2 • 🍚 Nasi × 1"
const parseQtyFromItems = (itemsStr: string): number[] => {
  const text = String(itemsStr || '');
  return MENU_LIST.map((menu) => {
    // Matching either "Ayam × 2" or "Tahu/Tempe × 2" or "Tahu / Tempe × 2"
    const safeName = menu.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex1 = new RegExp(safeName + '\\s*×\\s*(\\d+)', 'i');
    const match1 = text.match(regex1);
    if (match1) return Number(match1[1]) || 0;

    // Fallback for variation in Tahu/Tempe
    if (menu.id === 2) {
      const matchSlash = text.match(/Tahu\/Tempe\s*×\s*(\d+)/i);
      if (matchSlash) return Number(matchSlash[1]) || 0;
    }
    return 0;
  });
};

export default function App() {
  // Form State
  const [customer, setCustomer] = useState<string>('');
  const [qty, setQty] = useState<number[]>([0, 0, 0, 0, 0]);
  const [lelePriceStr, setLelePriceStr] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QRIS'>('Cash');
  const [editingNumber, setEditingNumber] = useState<number | null>(null);

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<'All' | 'Cash' | 'QRIS'>('All');

  // UI state for alerts, dialogs & modals
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Order | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const customerInputRef = useRef<HTMLInputElement>(null);
  const leleInputRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  // Show auto-dismissing toast
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((curr) => (curr?.text === text ? null : curr));
    }, 3200);
  };

  // Load Initial Data from localStorage
  useEffect(() => {
    try {
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) {
        const old = localStorage.getItem(OLD_STORAGE_KEY);
        if (old) saved = JSON.parse(old);
      }

      if (saved && Array.isArray(saved.orders)) {
        const loadedOrders: Order[] = saved.orders.map((o: any, idx: number) => ({
          number: Number(o.number) || idx + 1,
          customer: o.customer || 'Pelanggan',
          items: o.items || '',
          total: Number(o.total) || 0,
          itemsCount: Number(o.itemsCount) || 0,
          lelePrice: Number(o.lelePrice) || 0,
          paymentMethod: o.paymentMethod === 'QRIS' ? 'QRIS' : 'Cash',
          createdAt: o.createdAt || new Date().toISOString(),
        }));

        // Sort descending by createdAt
        loadedOrders.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(loadedOrders);
      }
    } catch (err) {
      console.warn('Error reading stored orders:', err);
    }
  }, []);

  // Save to localStorage whenever orders change
  const persistOrders = (newOrders: Order[]) => {
    // Chronological renumbering: oldest is #1, newest is #N
    const chronological = [...newOrders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    chronological.forEach((o, index) => {
      o.number = index + 1;
    });

    // Display sort: newest first
    chronological.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setOrders(chronological);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ orders: chronological, number: chronological.length })
      );
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  };

  // Get current numerical Lele price
  const parsedLelePrice = useMemo(() => {
    const clean = String(lelePriceStr).replace(/[^0-9]/g, '');
    return Number(clean) || 0;
  }, [lelePriceStr]);

  // Calculate current order total
  const currentTotal = useMemo(() => {
    return qty.reduce((sum, count, idx) => {
      const price = idx === 4 ? parsedLelePrice : MENU_LIST[idx].price;
      return sum + (Number(count) || 0) * price;
    }, 0);
  }, [qty, parsedLelePrice]);

  // Adjust item quantity
  const handleQtyChange = (index: number, delta: number) => {
    setQty((prev) => {
      const next = [...prev];
      next[index] = Math.max(0, (next[index] || 0) + delta);
      return next;
    });
  };

  // Clear/Reset Form
  const handleClearOrder = () => {
    setQty([0, 0, 0, 0, 0]);
    setCustomer('');
    setLelePriceStr('');
    setPaymentMethod('Cash');
    setEditingNumber(null);
  };

  // Start a fresh new order
  const handleNewOrder = () => {
    handleClearOrder();
    setTimeout(() => {
      customerInputRef.current?.focus();
    }, 100);
    showToast('Form pesanan baru siap', 'info');
  };

  // Save / Update Order
  const handleSaveOrder = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const leleQty = Number(qty[4]) || 0;
    if (leleQty > 0 && parsedLelePrice <= 0) {
      showToast('Masukkan harga Lele terlebih dahulu.', 'error');
      leleInputRef.current?.focus();
      return;
    }

    if (currentTotal <= 0) {
      showToast('Pilih menu terlebih dahulu.', 'error');
      return;
    }

    const trimmedCustomer = customer.trim() || 'Pelanggan';

    const itemsSummary = qty
      .map((count, i) => (count > 0 ? `${MENU_LIST[i].icon} ${MENU_LIST[i].name} × ${count}` : ''))
      .filter(Boolean)
      .join(' • ');

    const itemsCount = qty.reduce((s, v) => s + (Number(v) || 0), 0);

    if (editingNumber !== null) {
      // Update existing order
      const updated = orders.map((o) => {
        if (o.number === editingNumber) {
          return {
            ...o,
            customer: trimmedCustomer,
            items: itemsSummary,
            total: currentTotal,
            itemsCount,
            lelePrice: parsedLelePrice,
            paymentMethod,
          };
        }
        return o;
      });

      persistOrders(updated);
      showToast(`Pesanan #${editingNumber} berhasil diperbarui!`, 'success');
      handleClearOrder();
    } else {
      // Create new order
      const newOrder: Order = {
        number: orders.length + 1,
        customer: trimmedCustomer,
        items: itemsSummary,
        total: currentTotal,
        itemsCount,
        lelePrice: parsedLelePrice,
        paymentMethod,
        createdAt: new Date().toISOString(),
      };

      const updated = [newOrder, ...orders];
      persistOrders(updated);
      showToast(`Pesanan berhasil disimpan! (${formatMoney(currentTotal)})`, 'success');
      handleClearOrder();
    }
  };

  // Edit Order handler
  const handleEditOrder = (order: Order) => {
    setEditingNumber(order.number);
    setCustomer(order.customer === 'Pelanggan' ? '' : order.customer);
    setLelePriceStr(order.lelePrice > 0 ? String(order.lelePrice) : '');
    setPaymentMethod(order.paymentMethod || 'Cash');

    const parsedQty = parseQtyFromItems(order.items);
    setQty(parsedQty);

    showToast(`Mengedit pesanan #${order.number}`, 'info');

    // Scroll smoothly to form top
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      customerInputRef.current?.focus();
    }, 200);
  };

  // Delete Order handler
  const confirmDelete = (order: Order) => {
    setDeleteConfirmOrder(order);
  };

  const executeDelete = () => {
    if (!deleteConfirmOrder) return;
    const targetNumber = deleteConfirmOrder.number;
    const updated = orders.filter((o) => o.number !== targetNumber);
    persistOrders(updated);

    if (editingNumber === targetNumber) {
      handleClearOrder();
    }

    showToast(`Pesanan #${targetNumber} berhasil dihapus.`, 'success');
    setDeleteConfirmOrder(null);
  };

  // Reset entire day / shift
  const executeResetAll = () => {
    persistOrders([]);
    handleClearOrder();
    setShowResetConfirm(false);
    showToast('Semua pesanan berhasil dikosongkan untuk shift baru.', 'info');
  };

  // Summary Metrics Calculations
  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + (Number(o.itemsCount) || 0), 0);
    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const cashSales = orders
      .filter((o) => o.paymentMethod !== 'QRIS')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const qrisSales = orders
      .filter((o) => o.paymentMethod === 'QRIS')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const itemTotals = {
      ayam: 0,
      nasi: 0,
      tahu: 0,
      ampela: 0,
      lele: 0,
    };

    orders.forEach((o) => {
      const q = parseQtyFromItems(o.items);
      itemTotals.ayam += q[0] || 0;
      itemTotals.nasi += q[1] || 0;
      itemTotals.tahu += q[2] || 0;
      itemTotals.ampela += q[3] || 0;
      itemTotals.lele += q[4] || 0;
    });

    return {
      totalOrders,
      totalItems,
      totalSales,
      cashSales,
      qrisSales,
      itemTotals,
    };
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        o.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(o.number).includes(searchQuery) ||
        o.items.toLowerCase().includes(searchQuery.toLowerCase());

      const matchMethod =
        filterMethod === 'All' ? true : o.paymentMethod === filterMethod;

      return matchSearch && matchMethod;
    });
  }, [orders, searchQuery, filterMethod]);

  // Receipt text copy handler
  const handleCopyReceipt = (order: Order) => {
    const receiptText = `*KASIR PESANAN*\n------------------------\nNo. Pesanan: #${order.number}\nPelanggan: ${order.customer}\nWaktu: ${formatDateTime(order.createdAt)}\nPembayaran: ${order.paymentMethod}\n------------------------\nRincian Menu:\n${order.items.split(' • ').join('\n')}${order.lelePrice > 0 ? `\n(Harga Lele: ${formatMoney(order.lelePrice)})` : ''}\n------------------------\n*TOTAL: ${formatMoney(order.total)}*\nTerima kasih atas kunjungannya!`;

    navigator.clipboard.writeText(receiptText).then(() => {
      showToast('Struk berhasil disalin ke clipboard!', 'success');
    });
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#17202a] pb-16 antialiased selection:bg-emerald-200">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full shadow-lg text-sm font-semibold flex items-center gap-2 border animate-in fade-in slide-in-from-top-3 duration-200 bg-white border-neutral-200 text-neutral-800">
          {toastMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {toastMsg.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
          {toastMsg.type === 'info' && <span className="w-2 h-2 rounded-full bg-emerald-600"></span>}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-[560px] mx-auto px-3.5 sm:px-4 pt-4 sm:pt-6" ref={formTopRef}>
        {/* Header Section */}
        <header className="flex justify-between items-center mb-4 pb-1">
          <div>
            <h1 className="text-[23px] sm:text-[25px] font-black tracking-tight text-[#17202a] flex items-center gap-2">
              <span>🧾</span> Kasir Pesanan
            </h1>
            <div className="text-[13px] text-[#667085] font-medium">
              Satu pelanggan = satu pesanan
            </div>
          </div>
          <button
            type="button"
            onClick={handleNewOrder}
            className="inline-flex items-center gap-1.5 bg-[#16834b] hover:bg-[#126c3d] active:scale-95 transition-all text-white px-3.5 py-2 rounded-xl text-sm font-bold shadow-sm cursor-pointer min-h-[44px]"
            title="Mulai pesanan baru"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Baru</span>
          </button>
        </header>

        {/* Editing Banner */}
        {editingNumber !== null && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-amber-900 text-sm animate-in fade-in">
            <div className="flex items-center gap-2 font-semibold">
              <Edit2 className="w-4 h-4 text-amber-700" />
              <span>Sedang mengedit Pesanan #{editingNumber}</span>
            </div>
            <button
              onClick={handleClearOrder}
              className="text-xs bg-amber-200/70 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-bold text-amber-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
        )}

        {/* 1. Input Pelanggan */}
        <div className="bg-white border border-[#e0e6e2] rounded-2xl p-3.5 sm:p-4 mb-3 shadow-xs">
          <label htmlFor="customer" className="block text-[13px] font-semibold text-[#667085] mb-1.5">
            Nama pelanggan / nomor meja
          </label>
          <div className="relative">
            <input
              id="customer"
              ref={customerInputRef}
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Contoh: Meja 1 / Bapak Andi"
              className="w-full min-h-[44px] border border-[#d9e0dc] focus:border-[#16834b] focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3.5 text-[15px] sm:text-[16px] outline-none transition bg-neutral-50/30 focus:bg-white"
            />
            {customer && (
              <button
                type="button"
                onClick={() => setCustomer('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#8c96a3] mt-1.5">
            *Jika dikosongkan, pesanan otomatis diberi nama <span className="font-semibold text-neutral-700">“Pelanggan”</span>.
          </p>
        </div>

        {/* 2. Daftar Menu & Harga */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {MENU_LIST.map((menu) => {
            const count = qty[menu.id] || 0;
            const isLele = menu.isManualPrice;

            return (
              <div
                key={menu.id}
                className={`bg-white border rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between transition-all ${
                  count > 0 ? 'border-emerald-500 ring-1 ring-emerald-500/20 shadow-xs' : 'border-[#e0e6e2]'
                } ${isLele ? 'col-span-2 sm:col-span-1' : ''}`}
              >
                <div>
                  <div className="text-2xl sm:text-[30px] leading-tight select-none">{menu.icon}</div>
                  <div className="font-extrabold text-[#17202a] text-[15px] sm:text-[16px] mt-1">
                    {menu.name}
                  </div>

                  {!isLele ? (
                    <div className="text-[13px] text-[#667085] font-semibold mt-0.5">
                      {formatMoney(menu.price)}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <div className="text-[12px] text-neutral-500 font-medium mb-1">
                        Harga lele (manual):
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                          Rp
                        </span>
                        <input
                          id="lelePrice"
                          ref={leleInputRef}
                          type="text"
                          inputMode="numeric"
                          value={lelePriceStr ? new Intl.NumberFormat('id-ID').format(parsedLelePrice) : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            setLelePriceStr(raw);
                          }}
                          placeholder="0"
                          className="w-full min-h-[38px] pl-8 pr-2.5 text-sm font-semibold border border-[#d9e0dc] focus:border-[#16834b] focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none bg-neutral-50/50 focus:bg-white"
                        />
                      </div>
                      {/* Quick chips for rapid cashier typing */}
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {[13000, 15000, 17000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setLelePriceStr(String(preset))}
                            className={`text-[11px] px-1.5 py-0.5 rounded border transition cursor-pointer font-medium ${
                              parsedLelePrice === preset
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                            }`}
                          >
                            {preset / 1000}k
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    disabled={count === 0}
                    onClick={() => handleQtyChange(menu.id, -1)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl font-black text-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[#eef7f1] text-[#16834b] active:scale-95 hover:bg-emerald-100"
                    aria-label={`Kurangi ${menu.name}`}
                  >
                    −
                  </button>

                  <span
                    id={`q${menu.id}`}
                    className={`text-[19px] font-black transition-colors ${
                      count > 0 ? 'text-[#16834b]' : 'text-neutral-700'
                    }`}
                  >
                    {count}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleQtyChange(menu.id, 1)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl font-black text-xl transition-all cursor-pointer bg-[#eef7f1] text-[#16834b] active:scale-95 hover:bg-emerald-100"
                    aria-label={`Tambah ${menu.name}`}
                  >
                    ＋
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Metode Pembayaran Panel */}
        <div className="bg-white border border-[#e0e6e2] rounded-2xl p-3.5 sm:p-4 mb-3 shadow-xs">
          <label htmlFor="paymentMethod" className="block text-[13px] font-semibold text-[#667085] mb-2">
            Metode Pembayaran
          </label>

          {/* Quick Segmented Toggle */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('Cash')}
              className={`min-h-[46px] rounded-xl flex items-center justify-center gap-2 font-bold text-[15px] border transition-all cursor-pointer ${
                paymentMethod === 'Cash'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-1 ring-emerald-500'
                  : 'bg-white border-[#d9e0dc] text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="text-lg">💵</span>
              <span>Cash (Tunai)</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('QRIS')}
              className={`min-h-[46px] rounded-xl flex items-center justify-center gap-2 font-bold text-[15px] border transition-all cursor-pointer ${
                paymentMethod === 'QRIS'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-1 ring-emerald-500'
                  : 'bg-white border-[#d9e0dc] text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="text-lg">📱</span>
              <span>QRIS</span>
            </button>
          </div>

          {/* Fallback standard select for exact HTML compatibility */}
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'QRIS')}
            className="w-full min-h-[42px] border border-[#d9e0dc] rounded-xl px-3 text-sm font-semibold bg-neutral-50/50 text-neutral-700 outline-none focus:border-[#16834b]"
          >
            <option value="Cash">💵 Cash</option>
            <option value="QRIS">📱 QRIS</option>
          </select>
        </div>

        {/* 4. Total Box (Perhitungan Otomatis & Tombol Aksi) */}
        <div className="bg-[#eaf7ef] border border-[#bfe4cc] rounded-2xl p-4 sm:p-5 mb-4 shadow-xs">
          <div className="flex justify-between items-center">
            <div className="text-[12px] uppercase tracking-wider font-extrabold text-[#16834b]">
              TOTAL PESANAN
            </div>
            {qty.reduce((a, b) => a + b, 0) > 0 && (
              <span className="text-xs bg-emerald-200/70 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                {qty.reduce((a, b) => a + b, 0)} item
              </span>
            )}
          </div>

          <div
            id="total"
            className="text-[28px] sm:text-[32px] font-black tracking-tight text-[#17202a] my-1"
          >
            {formatMoney(currentTotal)}
          </div>

          <div className="flex gap-2.5 mt-3 pt-2">
            <button
              id="saveBtn"
              type="button"
              onClick={handleSaveOrder}
              className="flex-1 min-h-[46px] bg-[#16834b] hover:bg-[#126c3d] text-white font-extrabold text-[15px] sm:text-[16px] rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              <span>{editingNumber !== null ? 'Update Pesanan' : 'Simpan'}</span>
            </button>

            <button
              id="clearBtn"
              type="button"
              onClick={handleClearOrder}
              className="min-h-[46px] px-4 bg-white hover:bg-neutral-50 text-[#17202a] border border-[#d9e0dc] font-bold text-sm rounded-xl transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4 text-neutral-500" />
              <span>{editingNumber !== null ? 'Batal Edit' : 'Kosongkan'}</span>
            </button>
          </div>
        </div>

        {/* 5. Informasi Total Pesanan (Ringkasan / Rekap Penjualan) */}
        <div className="bg-white border border-[#e0e6e2] rounded-2xl p-4 sm:p-5 mb-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
            <div className="text-[17px] sm:text-[18px] font-black text-[#17202a] flex items-center gap-2">
              <span>📊</span> Informasi Total Pesanan
            </div>
            {orders.length > 0 && (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer"
                title="Reset rekap untuk hari baru"
              >
                Reset Shift
              </button>
            )}
          </div>

          {/* Metrik Utama: Jumlah Pesanan & Total Item */}
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-3">
              <div className="text-[12px] font-semibold text-[#667085]">Jumlah Pesanan</div>
              <div id="orderCount" className="text-[22px] font-black text-[#17202a] mt-0.5">
                {summary.totalOrders}
              </div>
            </div>
            <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-3">
              <div className="text-[12px] font-semibold text-[#667085]">Total Item</div>
              <div id="itemCount" className="text-[22px] font-black text-[#17202a] mt-0.5">
                {summary.totalItems}
              </div>
            </div>
          </div>

          {/* Jumlah Terjual per Menu */}
          <div className="mt-4">
            <div className="text-[13px] font-extrabold text-neutral-800 mb-2">
              Jumlah Terjual per Menu
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-2.5">
                <div className="text-[12px] text-[#667085] font-semibold">🍗 Ayam</div>
                <div id="itemAyam" className="text-[20px] font-black text-[#17202a]">
                  {summary.itemTotals.ayam}
                </div>
              </div>
              <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-2.5">
                <div className="text-[12px] text-[#667085] font-semibold">🍚 Nasi</div>
                <div id="itemNasi" className="text-[20px] font-black text-[#17202a]">
                  {summary.itemTotals.nasi}
                </div>
              </div>
              <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-2.5">
                <div className="text-[12px] text-[#667085] font-semibold">🥢 Tahu / Tempe</div>
                <div id="itemTahu" className="text-[20px] font-black text-[#17202a]">
                  {summary.itemTotals.tahu}
                </div>
              </div>
              <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-2.5">
                <div className="text-[12px] text-[#667085] font-semibold">🍢 Ampela</div>
                <div id="itemAmpela" className="text-[20px] font-black text-[#17202a]">
                  {summary.itemTotals.ampela}
                </div>
              </div>
              <div className="bg-neutral-50/70 border border-[#e0e6e2] rounded-xl p-2.5 col-span-2 sm:col-span-1">
                <div className="text-[12px] text-[#667085] font-semibold">🐟 Lele</div>
                <div id="itemLele" className="text-[20px] font-black text-[#17202a]">
                  {summary.itemTotals.lele}
                </div>
              </div>
            </div>
          </div>

          {/* Total Penjualan & Breakdown Cash / QRIS */}
          <div className="mt-4 pt-3 border-t border-neutral-100">
            <div className="text-[12px] text-[#667085] font-semibold uppercase tracking-wider">
              Total Penjualan
            </div>
            <div
              id="salesTotal"
              className="text-[26px] sm:text-[28px] font-black text-emerald-800 mt-0.5 tracking-tight"
            >
              {formatMoney(summary.totalSales)}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-2.5">
                <div className="text-[12px] text-emerald-800 font-semibold flex items-center gap-1">
                  <span>💵</span> Total Cash
                </div>
                <div id="cashTotal" className="text-[19px] sm:text-[20px] font-extrabold text-[#17202a]">
                  {formatMoney(summary.cashSales)}
                </div>
              </div>

              <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-2.5">
                <div className="text-[12px] text-sky-800 font-semibold flex items-center gap-1">
                  <span>📱</span> Total QRIS
                </div>
                <div id="qrisTotal" className="text-[19px] sm:text-[20px] font-extrabold text-[#17202a]">
                  {formatMoney(summary.qrisSales)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Daftar Pesanan */}
        <div className="bg-white border border-[#e0e6e2] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-[17px] sm:text-[18px] font-black text-[#17202a]">
                📋 Daftar Pesanan
              </span>
              <span className="bg-neutral-100 text-neutral-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {orders.length}
              </span>
            </div>

            {/* Quick search input if more than 3 orders */}
            {orders.length > 2 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari pelanggan/meja..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs border border-neutral-200 rounded-lg outline-none focus:border-emerald-500 w-full sm:w-44"
                />
              </div>
            )}
          </div>

          {/* Filter Bar */}
          {orders.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 mb-2 overflow-x-auto text-xs font-semibold">
              <span className="text-neutral-400 text-[11px] mr-1">Filter:</span>
              {(['All', 'Cash', 'QRIS'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMethod(mode)}
                  className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                    filterMethod === mode
                      ? 'bg-neutral-800 border-neutral-800 text-white'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {mode === 'All' ? 'Semua' : mode === 'Cash' ? '💵 Cash' : '📱 QRIS'}
                </button>
              ))}
            </div>
          )}

          {/* Orders Container */}
          <div id="orders" className="mt-2 space-y-2.5">
            {filteredOrders.length === 0 ? (
              <div className="text-center text-[#667085] py-8 text-sm font-medium">
                {orders.length === 0 ? 'Belum ada pesanan.' : 'Tidak ada pesanan yang sesuai pencarian.'}
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isCurrentlyEdited = editingNumber === order.number;

                return (
                  <div
                    key={order.number}
                    className={`bg-white border rounded-xl p-3.5 transition-all ${
                      isCurrentlyEdited
                        ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-400/30'
                        : 'border-[#e0e6e2] hover:border-neutral-300'
                    }`}
                  >
                    {/* Header: #1 Meja 1 & Total */}
                    <div className="flex justify-between items-baseline gap-2 font-black">
                      <div className="text-[15px] sm:text-[16px] text-[#17202a] truncate">
                        #{order.number} <span className="font-extrabold">{order.customer}</span>
                      </div>
                      <div className="text-[16px] text-emerald-800 font-black whitespace-nowrap">
                        {formatMoney(order.total)}
                      </div>
                    </div>

                    {/* Metadata line: Time & Payment Method */}
                    <div className="text-[12px] text-[#667085] mt-1 flex items-center gap-2 flex-wrap">
                      <span>🕒 {formatDateTime(order.createdAt)}</span>
                      <span>•</span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-[11px] ${
                          order.paymentMethod === 'QRIS'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {order.paymentMethod === 'QRIS' ? '📱 QRIS' : '💵 Cash'}
                      </span>
                    </div>

                    {/* Items Details */}
                    <div className="text-[13px] text-[#555e6d] mt-2 leading-relaxed bg-neutral-50/70 p-2 rounded-lg border border-neutral-100 font-medium">
                      {order.items}
                      {order.lelePrice > 0 && (
                        <span className="text-neutral-500 font-normal">
                          {' '}
                          • Harga Lele: {formatMoney(order.lelePrice)}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons: Edit, Hapus, Struk */}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={() => handleEditOrder(order)}
                        className="flex-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#eef7f1] text-[#16834b] hover:bg-emerald-100 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveReceipt(order)}
                        className="px-3 min-h-[38px] py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1"
                        title="Lihat Struk"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Struk</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => confirmDelete(order)}
                        className="flex-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#fff0f0] text-[#c62828] border border-[#f2c4c4] hover:bg-rose-100 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal: Delete Order */}
      {deleteConfirmOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-extrabold text-neutral-900">Konfirmasi Hapus Pesanan</h3>
            <p className="text-sm text-neutral-600 mt-1.5 leading-normal">
              Apakah Anda yakin ingin menghapus pesanan{' '}
              <span className="font-bold text-neutral-900">
                #{deleteConfirmOrder.number} {deleteConfirmOrder.customer}
              </span>{' '}
              senilai{' '}
              <span className="font-bold text-emerald-700">
                {formatMoney(deleteConfirmOrder.total)}
              </span>
              ?
            </p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeleteConfirmOrder(null)}
                className="flex-1 min-h-[42px] rounded-xl border border-neutral-300 font-bold text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm text-white shadow-sm cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Entire Shift */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-extrabold text-neutral-900">Reset Shift & Rekap</h3>
            <p className="text-sm text-neutral-600 mt-1.5 leading-normal">
              Tindakan ini akan mengosongkan seluruh daftar pesanan ({orders.length} pesanan) dan memulai rekap dari 0 untuk hari/shift baru.
            </p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 min-h-[42px] rounded-xl border border-neutral-300 font-bold text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeResetAll}
                className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm text-white shadow-sm cursor-pointer"
              >
                Reset Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Struk Belanja */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setActiveReceipt(null)}
              className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Receipt Preview Body */}
            <div className="border border-neutral-200 border-dashed rounded-xl p-4 bg-neutral-50/50 font-mono text-xs text-neutral-800">
              <div className="text-center pb-2 border-b border-dashed border-neutral-300">
                <div className="font-extrabold text-sm tracking-wide">🧾 KASIR PESANAN</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">Struk Bukti Pembayaran</div>
              </div>

              <div className="py-2.5 border-b border-dashed border-neutral-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-500">No. Pesanan:</span>
                  <span className="font-bold">#{activeReceipt.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pelanggan:</span>
                  <span className="font-bold">{activeReceipt.customer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Waktu:</span>
                  <span>{formatDateTime(activeReceipt.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Metode:</span>
                  <span className="font-bold">
                    {activeReceipt.paymentMethod === 'QRIS' ? '📱 QRIS' : '💵 Cash (Tunai)'}
                  </span>
                </div>
              </div>

              <div className="py-2.5 border-b border-dashed border-neutral-300 space-y-1.5">
                <div className="font-bold text-[11px] text-neutral-600 mb-1">Rincian Menu:</div>
                {activeReceipt.items.split(' • ').map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span>{item}</span>
                  </div>
                ))}
                {activeReceipt.lelePrice > 0 && (
                  <div className="text-[10px] text-neutral-500 italic">
                    *Harga satuan Lele: {formatMoney(activeReceipt.lelePrice)}
                  </div>
                )}
              </div>

              <div className="pt-2.5 flex justify-between items-center text-sm font-extrabold">
                <span>TOTAL:</span>
                <span className="text-base text-emerald-800">{formatMoney(activeReceipt.total)}</span>
              </div>

              <div className="text-center text-[10px] text-neutral-400 mt-3">
                Terima kasih atas kunjungan Anda!
              </div>
            </div>

            {/* Actions for Receipt */}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => handleCopyReceipt(activeReceipt)}
                className="flex-1 min-h-[40px] rounded-xl border border-neutral-300 font-bold text-xs text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Teks</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    showToast('Gunakan tombol Salin Teks untuk membagikan struk.', 'info');
                  }
                }}
                className="flex-1 min-h-[40px] rounded-xl bg-[#16834b] text-white font-bold text-xs hover:bg-[#126c3d] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
