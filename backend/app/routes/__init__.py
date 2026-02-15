"""API blueprints."""
from .auth_customer import auth_customer_bp
from .auth_driver import auth_driver_bp
from .vendors import vendors_bp
from .menu import menu_bp
from .addresses import addresses_bp
from .orders import orders_bp
from .driver import driver_bp
from .admin import admin_bp
from .vendor import vendor_bp
from .whatsapp import whatsapp_bp
from .pricing import pricing_bp


def register_blueprints(app):
    app.register_blueprint(auth_customer_bp, url_prefix="/api/auth/customer")
    app.register_blueprint(auth_driver_bp, url_prefix="/api/auth/driver")
    app.register_blueprint(vendors_bp, url_prefix="/api/vendors")
    app.register_blueprint(menu_bp, url_prefix="/api/vendors")
    app.register_blueprint(addresses_bp, url_prefix="/api/addresses")
    app.register_blueprint(orders_bp, url_prefix="/api/orders")
    app.register_blueprint(driver_bp, url_prefix="/api/driver")
    app.register_blueprint(driver_bp, url_prefix="/api/drivers", name="drivers")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(vendor_bp, url_prefix="/api/vendor")
    app.register_blueprint(whatsapp_bp, url_prefix="/api/whatsapp")
    app.register_blueprint(pricing_bp, url_prefix="/api/pricing")
