import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), 'data', 'orders.json');
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// Ensure data folder exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Helpers to read/write persistent order database
function getOrders() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading orders from database file:', err);
  }
  return [];
}

function saveOrders(orders: any[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing orders to database file:', err);
    return false;
  }
}

// Default Seed User
const DEFAULT_USERS = [
  {
    id: 'USR-844',
    username: 'Aryan Rai',
    mobileNo: '8960025119',
    alternateNo: '9876543210',
    profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=240&q=80',
    address: 'Flat 402, Royal Palms, Sector 14, Main Market Road',
    landmark: 'Near City Hospital & Axis Bank ATM',
    password: 'password123',
    createdAt: new Date().toISOString()
  }
];

// Helpers to read/write persistent user accounts database
function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading users from database file:', err);
  }
  // Initialize with seed user
  saveUsers(DEFAULT_USERS);
  return DEFAULT_USERS;
}

function saveUsers(users: any[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing users to database file:', err);
    return false;
  }
}

// Express JSON middleware with increased payload size for profile images (base64)
app.use(express.json({ limit: '10mb' }));

/**
 * =========================================================================
 * REST API ENDPOINTS FOR ORDER DATABASE & DELIVERY DISPATCH
 * =========================================================================
 */

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Get all orders
app.get('/api/orders', (req, res) => {
  const orders = getOrders();
  const typeFilter = req.query.type as string;
  const statusFilter = req.query.status as string;

  let filtered = orders;
  if (typeFilter && typeFilter !== 'all') {
    filtered = filtered.filter((o: any) => o.orderType === typeFilter);
  }
  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter((o: any) => o.status === statusFilter);
  }

  res.json({
    success: true,
    total: filtered.length,
    orders: filtered
  });
});

// 3. Get single order by ID
app.get('/api/orders/:id', (req, res) => {
  const id = req.params.id.toUpperCase().replace('#', '');
  const orders = getOrders();
  const order = orders.find((o: any) => o.id === id || o.id === `TS-${id}` || o.id.replace('#', '') === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found in database' });
  }
  res.json({ success: true, order });
});

// 4. Create new order from customer webpage
app.post('/api/orders', (req, res) => {
  try {
    const {
      customer,
      phone,
      address,
      landmark,
      items,
      itemsList,
      subtotal,
      discount,
      delivery,
      couponCode,
      total,
      paymentMode,
      orderType,
      pickupTime,
      pickupNote,
      notes
    } = req.body;

    if (!customer || !phone) {
      return res.status(400).json({ success: false, error: 'Customer name and phone number are required' });
    }

    const orderId = req.body.id || `TS-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const newOrder = {
      id: orderId,
      orderType: orderType === 'pickup' ? 'pickup' : 'delivery',
      customer: String(customer).trim(),
      phone: String(phone).trim(),
      address: address ? String(address).trim() : (orderType === 'pickup' ? 'Store Counter Pickup' : 'Local Delivery Address'),
      landmark: landmark ? String(landmark).trim() : '',
      items: items || (itemsList ? itemsList.map((i: any) => `${i.name} (x${i.quantity || i.qty})`).join(', ') : 'Grocery items'),
      itemsList: itemsList || [],
      subtotal: Number(subtotal) || 0,
      discount: Number(discount) || 0,
      delivery: Number(delivery) || 0,
      couponCode: couponCode || null,
      total: Number(total) || (Number(subtotal) || 0),
      paymentMode: paymentMode || (orderType === 'pickup' ? 'Pay on Pickup (Cash/UPI)' : 'Cash on Delivery (COD)'),
      paymentStatus: 'Pending',
      status: 'Confirmed',
      deliveryBoy: 'Unassigned',
      pickupTime: pickupTime || (orderType === 'pickup' ? '⚡ ASAP - Ready in 15-20 Mins' : null),
      pickupNote: pickupNote || null,
      notes: notes || '',
      alternatePhone: req.body.alternatePhone || req.body.alternateNo || '',
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      deliveryDate: now.toISOString().split('T')[0],
      createdAt: now.toISOString()
    };

    const orders = getOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    console.log(`[DATABASE] New ${newOrder.orderType} order recorded: ${newOrder.id} from ${newOrder.customer} (${newOrder.phone})`);
    res.status(201).json({ success: true, order: newOrder });
  } catch (err: any) {
    console.error('Error creating order:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// 5. Update order status / dispatch details (for Owner & Delivery person)
app.patch('/api/orders/:id', (req, res) => {
  try {
    const id = req.params.id.toUpperCase().replace('#', '');
    const orders = getOrders();
    const index = orders.findIndex((o: any) => o.id === id || o.id === `TS-${id}` || o.id.replace('#', '') === id);

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const current = orders[index];
    const { status, deliveryBoy, notes, paymentStatus } = req.body;

    if (status !== undefined) current.status = status;
    if (deliveryBoy !== undefined) current.deliveryBoy = deliveryBoy;
    if (notes !== undefined) current.notes = notes;
    if (paymentStatus !== undefined) current.paymentStatus = paymentStatus;
    current.updatedAt = new Date().toISOString();

    orders[index] = current;
    saveOrders(orders);

    console.log(`[DATABASE] Updated order ${current.id}: status=${current.status}, rider=${current.deliveryBoy}`);
    res.json({ success: true, order: current });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update order' });
  }
});

// 6. Delete order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const id = req.params.id.toUpperCase().replace('#', '');
    const orders = getOrders();
    const filtered = orders.filter((o: any) => o.id !== id && o.id !== `TS-${id}` && o.id.replace('#', '') !== id);

    if (filtered.length === orders.length) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    saveOrders(filtered);
    res.json({ success: true, message: `Order #${id} deleted from database` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete order' });
  }
});

// 7. Store / Delivery statistics
app.get('/api/stats', (req, res) => {
  const orders = getOrders();
  const totalOrders = orders.length;
  const pendingDispatch = orders.filter((o: any) => ['Confirmed', 'Packing', 'New Order'].includes(o.status)).length;
  const outForDelivery = orders.filter((o: any) => o.status === 'Out for Delivery').length;
  const readyPickup = orders.filter((o: any) => o.status === 'Ready for Pickup').length;
  const delivered = orders.filter((o: any) => ['Delivered', 'Picked Up'].includes(o.status)).length;
  const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

  res.json({
    success: true,
    stats: {
      totalOrders,
      pendingDispatch,
      outForDelivery,
      readyPickup,
      delivered,
      totalSales
    }
  });
});

/**
 * =========================================================================
 * AUTHENTICATION & USER PROFILE REST API
 * =========================================================================
 */

// 8. Register new user account
app.post('/api/auth/register', (req, res) => {
  try {
    const {
      username,
      mobileNo,
      alternateNo,
      profileImage,
      address,
      landmark,
      password
    } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    const cleanMobile = String(mobileNo || '').trim().replace(/\D/g, '');
    if (!cleanMobile || cleanMobile.length !== 10) {
      return res.status(400).json({ success: false, error: 'Valid 10-digit primary mobile number is required' });
    }

    const cleanAlt = String(alternateNo || '').trim().replace(/\D/g, '');
    if (cleanAlt && cleanAlt.length !== 10) {
      return res.status(400).json({ success: false, error: 'Alternate mobile number must be 10 digits if provided' });
    }

    const users = getUsers();

    // Check if mobile already exists
    const existing = users.find((u: any) => u.mobileNo === cleanMobile);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this mobile number already exists. Please sign in.' });
    }

    const newId = `USR-${Math.floor(100 + Math.random() * 900)}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username.trim())}`;

    const newUser = {
      id: newId,
      username: username.trim(),
      mobileNo: cleanMobile,
      alternateNo: cleanAlt || '',
      profileImage: profileImage && profileImage.trim() ? profileImage : defaultAvatar,
      address: address ? String(address).trim() : '',
      landmark: landmark ? String(landmark).trim() : '',
      password: password || 'password123',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const { password: _, ...safeUser } = newUser;
    console.log(`[AUTH] New user registered: ${safeUser.username} (${safeUser.mobileNo})`);
    res.status(201).json({ success: true, user: safeUser, message: 'Account registered successfully' });
  } catch (err: any) {
    console.error('Error during registration:', err);
    res.status(500).json({ success: false, error: err.message || 'Registration failed' });
  }
});

// 9. Login user (by Username or Mobile Number)
app.post('/api/auth/login', (req, res) => {
  try {
    const { loginIdentifier, password } = req.body;
    if (!loginIdentifier || !loginIdentifier.trim()) {
      return res.status(400).json({ success: false, error: 'Username or Mobile number is required' });
    }

    const input = loginIdentifier.trim().toLowerCase();
    const cleanDigits = input.replace(/\D/g, '');
    const users = getUsers();

    const user = users.find((u: any) => {
      const uName = (u.username || '').toLowerCase();
      const uMobile = (u.mobileNo || '').replace(/\D/g, '');
      const uAlt = (u.alternateNo || '').replace(/\D/g, '');
      return uName === input || (cleanDigits.length === 10 && (uMobile === cleanDigits || uAlt === cleanDigits));
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found matching this username or mobile number' });
    }

    // Optional password verification
    if (password && user.password && user.password !== password) {
      return res.status(401).json({ success: false, error: 'Incorrect password. Please try again or use Quick Login' });
    }

    const { password: _, ...safeUser } = user;
    console.log(`[AUTH] User logged in: ${safeUser.username} (${safeUser.mobileNo})`);
    res.json({ success: true, user: safeUser, message: 'Logged in successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Login failed' });
  }
});

// 10. Get User Profile by ID
app.get('/api/auth/profile/:id', (req, res) => {
  const id = req.params.id;
  const users = getUsers();
  const user = users.find((u: any) => u.id === id || u.mobileNo === id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found' });
  }
  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// 11. Update User Profile
app.put('/api/auth/profile/:id', (req, res) => {
  try {
    const id = req.params.id;
    const users = getUsers();
    const index = users.findIndex((u: any) => u.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    const current = users[index];
    const { username, mobileNo, alternateNo, profileImage, address, landmark } = req.body;

    if (username !== undefined) current.username = String(username).trim();
    if (mobileNo !== undefined) current.mobileNo = String(mobileNo).trim().replace(/\D/g, '');
    if (alternateNo !== undefined) current.alternateNo = String(alternateNo).trim().replace(/\D/g, '');
    if (profileImage !== undefined) current.profileImage = profileImage;
    if (address !== undefined) current.address = String(address).trim();
    if (landmark !== undefined) current.landmark = String(landmark).trim();
    current.updatedAt = new Date().toISOString();

    saveUsers(users);

    const { password: _, ...safeUser } = current;
    console.log(`[AUTH] Profile updated: ${safeUser.username} (${safeUser.mobileNo})`);
    res.json({ success: true, user: safeUser, message: 'Profile updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update profile' });
  }
});

// 12. List public demo users
app.get('/api/auth/users', (req, res) => {
  const users = getUsers().map((u: any) => {
    const { password: _, ...safe } = u;
    return safe;
  });
  res.json({ success: true, users });
});

/**
 * =========================================================================
 * VITE MIDDLEWARE & STATIC FILE SERVING
 * =========================================================================
 */
async function startServer() {
  // Routes for clean URLs
  app.get('/owner', (req, res) => {
    res.redirect('/owner.html');
  });

  app.get('/admin', (req, res) => {
    res.redirect('/owner.html');
  });

  app.get('/login', (req, res) => {
    res.redirect('/login.html');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));

    app.get('/owner.html', (req, res) => {
      res.sendFile(path.join(distPath, 'owner.html'));
    });

    app.get('/login.html', (req, res) => {
      res.sendFile(path.join(distPath, 'login.html'));
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`🛒 Tripathi Store Server is running on port ${PORT}`);
    console.log(`🌐 Customer Store: http://localhost:${PORT}/`);
    console.log(`🔑 Login Page: http://localhost:${PORT}/login.html`);
    console.log(`🚚 Owner Delivery Portal: http://localhost:${PORT}/owner.html`);
    console.log(`💾 Database API: http://localhost:${PORT}/api/orders`);
    console.log(`===================================================`);
  });
}

startServer();
