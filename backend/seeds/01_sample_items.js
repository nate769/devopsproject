// Inserts demo inventory, but only into an empty table so restarts never duplicate data.

const SAMPLE_ITEMS = [
  { name: 'Wireless Mouse', sku: 'ELEC-001', category: 'Electronics', quantity: 42, unit_price: 19.99, reorder_level: 10, location: 'Aisle 1' },
  { name: 'USB-C Charger 65W', sku: 'ELEC-002', category: 'Electronics', quantity: 4, unit_price: 34.5, reorder_level: 8, location: 'Aisle 1' },
  { name: 'Mechanical Keyboard', sku: 'ELEC-003', category: 'Electronics', quantity: 15, unit_price: 89.0, reorder_level: 5, location: 'Aisle 2' },
  { name: 'A4 Printer Paper (500)', sku: 'OFF-001', category: 'Office', quantity: 120, unit_price: 6.25, reorder_level: 30, location: 'Shelf B' },
  { name: 'Gel Pens (Pack of 10)', sku: 'OFF-002', category: 'Office', quantity: 3, unit_price: 4.99, reorder_level: 15, location: 'Shelf B' },
  { name: 'Standing Desk Frame', sku: 'FURN-001', category: 'Furniture', quantity: 6, unit_price: 249.0, reorder_level: 2, location: 'Warehouse' },
  { name: 'Ergonomic Chair', sku: 'FURN-002', category: 'Furniture', quantity: 1, unit_price: 199.0, reorder_level: 3, location: 'Warehouse' },
  { name: 'Coffee Beans 1kg', sku: 'PANTRY-001', category: 'Pantry', quantity: 18, unit_price: 14.0, reorder_level: 6, location: 'Kitchen' },
];

exports.SAMPLE_ITEMS = SAMPLE_ITEMS;

exports.seed = async function seed(knex) {
  const [{ count }] = await knex('items').count({ count: '*' });
  if (Number(count) > 0) return;
  await knex('items').insert(
    SAMPLE_ITEMS.map(({ unit_price, ...item }) => ({ ...item, unit_price_cents: Math.round(unit_price * 100) })),
  );
};
