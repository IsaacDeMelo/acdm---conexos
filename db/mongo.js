// Conexão MongoDB compartilhada com a Oráculo (mesmo banco de dados)
// Senhas de acesso do Alquirves ficam numa coleção própria (acessprofiles),
// para não interferir nos dados da Oráculo.

const crypto = require('crypto');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

const userProfileSchema = new mongoose.Schema({
    jid: { type: String },
    lid: { type: String },
    name: String,
    realName: String,
    nickname: String,
    phoneNumber: String,
    acdmId: { type: String },
    rank: { type: String },
    totalMessageCount: Number,
    charisma: Number,
    honors: [String],
    prestige: Number,
    academyCash: Number,
    globalRank: Number,
    avatar: String
}, { strict: true });

const acessProfileSchema = new mongoose.Schema({
    acdmId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const registeredGroupSchema = new mongoose.Schema({
    jid: String,
    name: String,
    nick: String,
    desc: String,
    link: String
}, { strict: false });

const institCargoSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, unique: true },
    cargos: { type: Array, default: [] }
}, { timestamps: true });

const alrquivesRecordSchema = new mongoose.Schema({
    tipo: { type: String, enum: ['avl', 'cert'], required: true },
    status: {
        type: String,
        enum: ['finalizado', 'analise', 'adiado', 'emissao', 'solicitacao', 'vencido'],
        default: 'emissao'
    },
    titulo: { type: String, default: '' },
    licenciado: { type: String, default: '' },
    licenciante: { type: String, default: '' },
    outorgado: { type: String, default: '' },
    organizacao: { type: String, default: '' },
    validade: { type: String, default: '' },
    criadoPor: { type: String, default: '' }
}, { timestamps: true });

function getModel(name, schema, collection) {
    return mongoose.models[name] || mongoose.model(name, schema, collection);
}

function getModels() {
    return {
        UserProfile: getModel('UserProfile', userProfileSchema, 'userprofiles'),
        AcessProfile: getModel('AcessProfile', acessProfileSchema, 'acessprofiles'),
        RegisteredGroup: getModel('RegisteredGroup', registeredGroupSchema, 'registeredgroups'),
        AlrquivesRecord: getModel('AlrquivesRecord', alrquivesRecordSchema, 'alquirves_records'),
        InstitCargo: getModel('InstitCargo', institCargoSchema, 'instit_cargos')
    };
}

async function connectDb() {
    if (!MONGO_URI) {
        console.warn('[DB] MONGO_URI nao definido. Login do Alquirves indisponivel.');
        return;
    }

    if (mongoose.connection.readyState === 1) {
        return;
    }

    mongoose.set('bufferTimeoutMS', 3000);
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('[DB] Conectado ao MongoDB (banco compartilhado com a Oráculo).');
}

function isDbReady() {
    return MONGO_URI && mongoose.connection.readyState === 1;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
    try {
        const parts = String(stored).split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt') {
            return false;
        }
        const [, salt, hash] = parts;
        const computed = crypto.scryptSync(String(password), salt, 64).toString('hex');
        const a = Buffer.from(computed, 'hex');
        const b = Buffer.from(hash, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (_error) {
        return false;
    }
}

module.exports = {
    connectDb,
    isDbReady,
    getModels,
    hashPassword,
    verifyPassword,
    mongoose
};
