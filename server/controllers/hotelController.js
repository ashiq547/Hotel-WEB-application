const db = require('../config/db');

// Column sizes from the Hotel table (Image_Url is added by scripts/initDb.js)
const FIELD_LIMITS = { Hotel_Name: 100, Address: 255, City: 100, Contact_Number: 20, Image_Url: 500 };

// Returns an error message for invalid input, or null when the body is acceptable.
function validateHotelInput(body, { requireName }) {
  if (requireName && !(typeof body.Hotel_Name === 'string' && body.Hotel_Name.trim())) {
    return 'Hotel Name is required';
  }
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    if (body[field] != null && String(body[field]).length > max) {
      return `${field.replace('_', ' ')} must be at most ${max} characters`;
    }
  }
  if (body.Star_Rating != null && body.Star_Rating !== '') {
    const rating = Number(body.Star_Rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return 'Star Rating must be a whole number from 1 to 5';
    }
  }
  return null;
}

exports.getAllHotels = async (req, res, next) => {
  try {
    const [hotels] = await db.query(`
      SELECT h.*, 
             COUNT(DISTINCT r.Room_ID) as Total_Rooms,
             COUNT(DISTINCT e.Employee_ID) as Total_Employees
      FROM Hotel h
      LEFT JOIN Room r ON h.Hotel_ID = r.Hotel_ID
      LEFT JOIN Employee e ON h.Hotel_ID = e.Hotel_ID
      GROUP BY h.Hotel_ID
      ORDER BY h.Hotel_ID ASC
    `);
    res.json(hotels);
  } catch (err) {
    next(err);
  }
};

exports.getHotelById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [hotels] = await db.query('SELECT * FROM Hotel WHERE Hotel_ID = ?', [id]);
    if (hotels.length === 0) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    const [rooms] = await db.query('SELECT * FROM Room WHERE Hotel_ID = ?', [id]);
    res.json({ ...hotels[0], rooms });
  } catch (err) {
    next(err);
  }
};

exports.createHotel = async (req, res, next) => {
  try {
    const { Hotel_Name, Address, City, Contact_Number, Star_Rating, Image_Url } = req.body;
    const validationError = validateHotelInput(req.body, { requireName: true });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const [result] = await db.query(
      'INSERT INTO Hotel (Hotel_Name, Address, City, Contact_Number, Star_Rating, Image_Url) VALUES (?, ?, ?, ?, ?, ?)',
      [
        Hotel_Name.trim(),
        Address || null,
        City || 'Dhaka',
        Contact_Number || null,
        Star_Rating || 4,
        Image_Url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
      ]
    );

    const [newHotel] = await db.query('SELECT * FROM Hotel WHERE Hotel_ID = ?', [result.insertId]);
    res.status(201).json(newHotel[0]);
  } catch (err) {
    next(err);
  }
};

exports.updateHotel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Hotel_Name, Address, City, Contact_Number, Star_Rating, Image_Url } = req.body;
    const validationError = validateHotelInput(req.body, { requireName: false });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const [existing] = await db.query('SELECT * FROM Hotel WHERE Hotel_ID = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    await db.query(
      'UPDATE Hotel SET Hotel_Name = ?, Address = ?, City = ?, Contact_Number = ?, Star_Rating = ?, Image_Url = ? WHERE Hotel_ID = ?',
      [
        Hotel_Name || existing[0].Hotel_Name,
        Address !== undefined ? Address : existing[0].Address,
        City !== undefined ? City : existing[0].City,
        Contact_Number !== undefined ? Contact_Number : existing[0].Contact_Number,
        Star_Rating !== undefined ? Star_Rating : existing[0].Star_Rating,
        Image_Url !== undefined ? Image_Url : existing[0].Image_Url,
        id
      ]
    );

    const [updated] = await db.query('SELECT * FROM Hotel WHERE Hotel_ID = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
};

// Deletes a hotel together with its rooms. Refused (409) while the hotel still has
// employees assigned or any reservation history, so bills and service records stay intact.
exports.deleteHotel = async (req, res, next) => {
  const { id } = req.params;
  let connection;
  try {
    const [existing] = await db.query('SELECT Hotel_Name FROM Hotel WHERE Hotel_ID = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Hotel not found' });
    }
    const hotelName = existing[0].Hotel_Name;

    const [[{ employees, reservations }]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM Employee WHERE Hotel_ID = ?) AS employees,
         (SELECT COUNT(*) FROM Reservation res JOIN Room r ON res.Room_ID = r.Room_ID WHERE r.Hotel_ID = ?) AS reservations`,
      [id, id]
    );

    if (employees > 0 || reservations > 0) {
      const blockers = [];
      if (employees > 0) blockers.push(`${employees} employee(s) assigned (reassign or remove them first)`);
      if (reservations > 0) blockers.push(`${reservations} reservation(s) on record (kept to preserve billing history)`);
      return res.status(409).json({ error: `Cannot delete "${hotelName}": it has ${blockers.join(' and ')}.` });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [roomResult] = await connection.query('DELETE FROM Room WHERE Hotel_ID = ?', [id]);
    await connection.query('DELETE FROM Hotel WHERE Hotel_ID = ?', [id]);
    await connection.commit();

    res.json({ message: 'Hotel deleted successfully', Hotel_ID: Number(id), Rooms_Deleted: roomResult.affectedRows });
  } catch (err) {
    if (connection) await connection.rollback();
    // A booking or staff assignment created after the check above still blocks the delete via FK constraints
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Cannot delete this hotel: it is still referenced by employees or reservations.' });
    }
    next(err);
  } finally {
    if (connection) connection.release();
  }
};
