from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)
CORS(app)

# ==========================================
# 💾 CONFIGURACIÓN DE LA BASE DE DATOS SQLITE
# ==========================================
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'planclub.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ==========================================
# 📐 MODELO DE LA TABLA USUARIO
# ==========================================
class Usuario(db.Model):
    __tablename__ = 'usuario'
    id_usuario = db.Column(db.String(20), primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)  # El nickname que ingresa en el registro
    apellido = db.Column(db.String(50), nullable=True)   # Opcional por ahora, se llena en Perfil
    correo = db.Column(db.String(100), nullable=True)    # Opcional por ahora, se llena en Perfil
    contraseña = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {
            "id_usuario": self.id_usuario,
            "nombre": self.nombre,
            "apellido": self.apellido,
            "correo": self.correo
        }

# ==========================================
# 🚀 RUTA: REGISTRAR UN NUEVO USUARIO
# ==========================================
@app.route('/api/usuarios/registrar', methods=['POST'])
def registrar_usuario():
    try:
        datos = request.json
        print("Datos recibidos desde el Frontend:", datos)

        if not datos or 'nombre' not in datos or 'contraseña' not in datos:
            return jsonify({"status": "error", "mensaje": "Faltan campos obligatorios"}), 400

        # Validar si el usuario ya existe para evitar duplicados
        usuario_existente = Usuario.query.filter_by(nombre=datos.get('nombre')).first()
        if usuario_existente:
            return jsonify({"status": "error", "mensaje": "El nombre de usuario ya está en uso"}), 400

        # Creamos el registro. Apellido y correo van vacíos o con lo que envíe el front
        nuevo_usuario = Usuario(
            id_usuario=datos.get('id_usuario'),
            nombre=datos.get('nombre'),
            apellido=datos.get('apellido', None),
            correo=datos.get('correo', None),
            contraseña=datos.get('contraseña')
        )

        db.session.add(nuevo_usuario)
        db.session.commit()

        return jsonify({"status": "success", "mensaje": "¡Usuario guardado con éxito!"}), 201

    except Exception as e:
        db.session.rollback()
        print("Error interno:", str(e))
        return jsonify({"status": "error", "mensaje": str(e)}), 500

# ==========================================
# 🔍 RUTA: OBTENER TODOS LOS USUARIOS (PARA EL LOGIN)
# ==========================================
@app.route('/api/usuarios', methods=['GET'])
def obtener_usuarios():
    try:
        usuarios = Usuario.query.all()
        return jsonify([u.to_dict() for u in usuarios]), 200
    except Exception as e:
        return jsonify({"status": "error", "mensaje": str(e)}), 500

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    # Render asigna el puerto automáticamente en esta variable de entorno
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 📊 MODELOS DE BASE DE DATOS PARA EL CHAT
# ==========================================

class Usuario(db.Model):
    __tablename__ = 'usuario'
    id_usuario = db.Column(db.String(20), primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)
    contraseña = db.Column(db.String(100), nullable=False)

class Chat(db.Model):
    __tablename__ = 'chat'
    id_chat = db.Column(db.String(20), primary_key=True) # El código único del chat (ej: CHAT_1234)
    id_cliente = db.Column(db.String(50), nullable=False)
    id_vendedor = db.Column(db.String(50), nullable=False)
    estado = db.Column(db.String(20), default="ACTIVO")  # ACTIVO o TERMINADO
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow)

class Mensaje(db.Model):
    __tablename__ = 'mensaje'
    id_mensaje = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_chat = db.Column(db.String(20), db.ForeignKey('chat.id_chat'), nullable=False)
    remitente = db.Column(db.String(50), nullable=False) # Nombre del que envía
    rol_remitente = db.Column(db.String(20), nullable=False) # 'cliente' o 'vendedor'
    contenido = db.Column(db.Text, nullable=False)
    fecha_envio = db.Column(db.DateTime, default=datetime.utcnow)

# ==========================================
# 🚀 ENDPOINTS DEL SISTEMA DE CHAT VIP
# ==========================================

# 1. Crear o unirse a un chat con un código
@app.route('/api/chat/acceder', methods=['POST'])
def acceder_chat():
    datos = request.json
    id_chat = datos.get('id_chat')
    usuario = datos.get('usuario')
    rol = datos.get('rol') # 'cliente' o 'vendedor'

    if not id_chat or not usuario or not rol:
        return jsonify({"status": "error", "mensaje": "Datos incompletos"}), 400

    # Buscar si el chat ya existe
    chat = Chat.query.filter_by(id_chat=id_chat).first()

    if not chat:
        # Si no existe, se crea asignando el rol correspondiente
        chat = Chat(
            id_chat=id_chat,
            id_cliente=usuario if rol == 'cliente' else 'Esperando...',
            id_vendedor=usuario if rol == 'vendedor' else 'Esperando...',
            estado="ACTIVO"
        )
        db.session.add(chat)
    else:
        if chat.estado == "TERMINADO":
            return jsonify({"status": "error", "mensaje": "Este chat ya ha sido finalizado por venta terminada"}), 400
        
        # Si existe, el que entra se vincula al campo vacío
        if rol == 'cliente' and chat.id_cliente == 'Esperando...':
            chat.id_cliente = usuario
        elif rol == 'vendedor' and chat.id_vendedor == 'Esperando...':
            chat.id_vendedor = usuario

    db.session.commit()
    return jsonify({"status": "success", "id_chat": chat.id_chat, "estado": chat.estado}), 200

# 2. Listar todos los chats activos de un vendedor (Estilo WhatsApp)
@app.route('/api/chat/vendedor/<id_vendedor>', methods=['GET'])
def listar_chats_vendedor(id_vendedor):
    chats = Chat.query.filter_by(id_vendedor=id_vendedor, estado="ACTIVO").all()
    resultado = []
    for c in chats:
        # Obtener el último mensaje de este chat si existe
        ultimo_msg = Mensaje.query.filter_by(id_chat=c.id_chat).order_by(Mensaje.fecha_envio.desc()).first()
        resultado.append({
            "id_chat": c.id_chat,
            "id_cliente": c.id_cliente,
            "ultimo_mensaje": ultimo_msg.contenido if ultimo_msg else "Chat iniciado sin mensajes"
        })
    return jsonify(resultado), 200

# 3. Enviar un mensaje
@app.route('/api/chat/mensaje', methods=['POST'])
def enviar_mensaje():
    datos = request.json
    nuevo_msg = Mensaje(
        id_chat=datos.get('id_chat'),
        remitente=datos.get('remitente'),
        rol_remitente=datos.get('rol_remitente'),
        contenido=datos.get('contenido')
    )
    db.session.add(nuevo_msg)
    db.session.commit()
    return jsonify({"status": "success"}), 201

# 4. Obtener historial de mensajes de un chat específico
@app.route('/api/chat/mensajes/<id_chat>', methods=['GET'])
def obtener_mensajes(id_chat):
    mensajes = Mensaje.query.filter_by(id_chat=id_chat).order_by(Mensaje.fecha_envio.asc()).all()
    return jsonify([{
        "remitente": m.remitente,
        "rol": m.rol_remitente,
        "contenido": m.contenido,
        "fecha": m.fecha_envio.strftime("%H:%M")
    } for m in mensajes]), 200

# 5. Botón Terminar Chat (Venta completada)
@app.route('/api/chat/terminar/<id_chat>', methods=['POST'])
def terminar_chat(id_chat):
    chat = Chat.query.filter_by(id_chat=id_chat).first()
    if chat:
        chat.estado = "TERMINADO"
        db.session.commit()
        return jsonify({"status": "success", "mensaje": "Venta finalizada. Chat cerrado."}), 200
    return jsonify({"status": "error", "mensaje": "Chat no encontrado"}), 404

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, port=5000)