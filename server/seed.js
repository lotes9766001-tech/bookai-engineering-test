import bcrypt from 'bcryptjs';
import { db, initDb } from './db.js';
initDb();
const email='demo@bookai.com.tw';
let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
if(!user){
 const u=db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run('Demo Owner',email,bcrypt.hashSync('demo123456',10));
 const c=db.prepare('INSERT INTO companies (name,tax_id,industry,plan,owner_id) VALUES (?,?,?,?,?)').run('珍珠奶茶王國有限公司','12345678','手搖飲','pro',u.lastInsertRowid);
 db.prepare('INSERT INTO company_users (company_id,user_id,role) VALUES (?,?,?)').run(c.lastInsertRowid,u.lastInsertRowid,'owner');
 console.log('Seed complete: demo@bookai.com.tw / demo123456');
} else console.log('Seed already exists');
