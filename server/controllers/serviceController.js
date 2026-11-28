const db = require('../config/db');
const rbac = require('../utils/rbac');

const mapServiceFields = (s) => {
  if (!s) return s;
  return {
    ...s,
    Service_Name: s.Service_Name || s.Service_Type
  };
};

exports.getAllServices = async (req, res, next) => {
  try {
    const [services] = await db.query('SELECT * FROM Service ORDER BY Service_ID ASC');
    res.json(services.map(mapServiceFields));
  } catch (err) {
    next(err);
  }
};

exports.createService = async (req, res, next) => {
  try {
    const { Service_Type, Service_Name, Service_Charge, Service_Description } = req.body;
    const type = Service_Type || Service_Name;
    const charge = Service_Charge == null || Service_Charge === '' ? 0 : Number(Service_Charge);

    if (!type) {
      return res.status(400).json({ error: 'Service Type is required' });
    }
    if (!Number.isFinite(charge) || charge < 0) {
      return res.status(400).json({ error: 'Service charge must be a non-negative number' });
    }

    const [result] = await db.query(
      'INSERT INTO Service (Service_Type, Service_Name, Service_Charge, Service_Description) VALUES (?, ?, ?, ?)',
      [type, Service_Name || type, charge, Service_Description || null]
    );

    const [newService] = await db.query('SELECT * FROM Service WHERE Service_ID = ?', [result.insertId]);
    res.status(201).json(mapServiceFields(newService[0]));
  } catch (err) {
    next(err);
  }
};

exports.updateService = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Service_Type, Service_Name, Service_Charge, Service_Description } = req.body;

    const [existing] = await db.query('SELECT * FROM Service WHERE Service_ID = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (Service_Charge !== undefined &&
        (!Number.isFinite(Number(Service_Charge)) || Number(Service_Charge) < 0)) {
      return res.status(400).json({ error: 'Service charge must be a non-negative number' });
    }

    await db.query(
      `UPDATE Service SET 
        Service_Type = COALESCE(?, Service_Type),
        Service_Name = COALESCE(?, Service_Name),
        Service_Charge = COALESCE(?, Service_Charge),
        Service_Description = COALESCE(?, Service_Description)
       WHERE Service_ID = ?`,
      [Service_Type, Service_Name, Service_Charge, Service_Description, id]
    );

    const [updated] = await db.query('SELECT * FROM Service WHERE Service_ID = ?', [id]);
    res.json(mapServiceFields(updated[0]));
  } catch (err) {
    next(err);
  }
};

exports.deleteService = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM Service WHERE Service_ID = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await db.query('DELETE FROM Service WHERE Service_ID = ?', [id]);
    res.json({ message: 'Service deleted successfully', Service_ID: id });
  } catch (err) {
    next(err);
  }
};

// Service Records (assigning service to guest)
exports.getGuestServiceRecords = async (req, res, next) => {
  try {
    const { guestId } = req.query;
    let query = `
      SELECT sr.*, s.Service_Type, COALESCE(s.Service_Name, s.Service_Type) as Service_Name, g.Full_Name
      FROM Service_Record sr
      JOIN Service s ON sr.Service_ID = s.Service_ID
      JOIN Guest g ON sr.Guest_ID = g.Guest_ID
      LEFT JOIN Bill b ON sr.Bill_ID = b.Bill_ID
      LEFT JOIN Reservation r ON b.Reservation_ID = r.Reservation_ID
      LEFT JOIN Room rm ON r.Room_ID = rm.Room_ID
      LEFT JOIN Hotel h ON rm.Hotel_ID = h.Hotel_ID
    `;
    const filters = [];
    const params = [];
    if (req.user.type === 'Guest') {
      filters.push('sr.Guest_ID = ?');
      params.push(req.user.id);
    } else {
      if (guestId) {
        filters.push('sr.Guest_ID = ?');
        params.push(guestId);
      }
      if (req.rbac && req.rbac.role !== 'Admin') {
        await rbac.ensureHotelOwnerColumn();
        await rbac.memberOfHotels(req.user.id);
        filters.push(`(
          h.Owner_Employee_ID = ?
          OR EXISTS (
            SELECT 1 FROM Hotel_Member hm
            WHERE hm.Hotel_ID = h.Hotel_ID AND hm.Employee_ID = ?
          )
        )`);
        params.push(req.user.id, req.user.id);
      }
    }
    if (filters.length) query += ` WHERE ${filters.join(' AND ')}`;
    query += ' ORDER BY sr.Service_Record_ID DESC';

    const [records] = await db.query(query, params);
    
    const formatted = records.map(r => {
      const parts = (r.Full_Name || '').split(' ');
      return {
        ...r,
        First_Name: parts[0] || '',
        Last_Name: parts.slice(1).join(' ') || ''
      };
    });

    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

exports.assignServiceToGuest = async (req, res, next) => {
  try {
    const { Guest_ID, Service_ID, Reservation_ID, Quantity, Service_Date } = req.body;
    const guestId = Number(Guest_ID);
    const serviceId = Number(Service_ID);
    const reservationId = Number(Reservation_ID);
    const qty = Number(Quantity === undefined ? 1 : Quantity);
    if (![guestId, serviceId, reservationId].every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ error: 'Guest, Service, and Reservation are required' });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 100' });
    }
    if (Service_Date !== undefined) {
      const serviceDate = new Date(`${Service_Date}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(Service_Date) ||
          Number.isNaN(serviceDate.getTime()) || serviceDate.toISOString().slice(0, 10) !== Service_Date) {
        return res.status(400).json({ error: 'Service date must be a valid YYYY-MM-DD date' });
      }
    }

    // Validate Guest existence
    const [guests] = await db.query('SELECT Guest_ID FROM Guest WHERE Guest_ID = ?', [guestId]);
    if (guests.length === 0) {
      return res.status(404).json({ error: `Guest account #${guestId} not found. Please re-login.` });
    }

    const [services] = await db.query('SELECT Service_Type, Service_Charge FROM Service WHERE Service_ID = ?', [serviceId]);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const [reservations] = await db.query(
      `SELECT r.Guest_ID, rm.Hotel_ID
       FROM Reservation r JOIN Room rm ON r.Room_ID = rm.Room_ID
       WHERE r.Reservation_ID = ?`,
      [reservationId]
    );
    if (!reservations.length || Number(reservations[0].Guest_ID) !== guestId) {
      return res.status(404).json({ error: 'Reservation not found for this guest' });
    }
    const hotelId = reservations[0].Hotel_ID;
    if (!await rbac.isHotelOwner(hotelId, req.user.id) &&
        !await rbac.isHotelMember(hotelId, req.user.id)) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    if (!await rbac.hotelPermission(hotelId, req.user.id, 'service:assign')) {
      return res.status(403).json({ error: 'Only a hotel owner or manager-member can assign services' });
    }

    const unitCharge = Number(services[0].Service_Charge || 0);
    const totalCharge = unitCharge * qty;
    const date = Service_Date || new Date().toISOString().split('T')[0];

    // Find or create the bill for the linked reservation.
    let billId = null;
    const [bills] = await db.query('SELECT Bill_ID FROM Bill WHERE Reservation_ID = ?', [reservationId]);
    if (bills.length > 0) {
      billId = bills[0].Bill_ID;
    } else {
      const [newBill] = await db.query(
        'INSERT INTO Bill (Reservation_ID, Total_Amount, Payment_Status) VALUES (?, ?, ?)',
        [reservationId, 0.00, 'Pending']
      );
      billId = newBill.insertId;
    }

    const [result] = await db.query(
      `INSERT INTO Service_Record (Guest_ID, Service_ID, Bill_ID, Service_Date, Quantity, Charge)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guestId, serviceId, billId, date, qty, totalCharge]
    );

    // Update Bill Total_Amount if billId exists
    if (billId) {
      await db.query('UPDATE Bill SET Total_Amount = Total_Amount + ? WHERE Bill_ID = ?', [totalCharge, billId]);
    }

    const [newRecord] = await db.query(`
      SELECT sr.*, s.Service_Type, COALESCE(s.Service_Name, s.Service_Type) as Service_Name, g.Full_Name
      FROM Service_Record sr
      JOIN Service s ON sr.Service_ID = s.Service_ID
      JOIN Guest g ON sr.Guest_ID = g.Guest_ID
      WHERE sr.Service_Record_ID = ?
    `, [result.insertId]);

    const parts = (newRecord[0]?.Full_Name || '').split(' ');
    const formatted = {
      ...newRecord[0],
      First_Name: parts[0] || '',
      Last_Name: parts.slice(1).join(' ') || ''
    };

    res.status(201).json(formatted);
  } catch (err) {
    next(err);
  }
};
