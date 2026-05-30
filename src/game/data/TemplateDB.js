import { LocalDB } from './LocalDB.js';

/**
 * TemplateDB.js
 * 
 * Gerencia os templates de GameObjects (propriedades padrão).
 */
export class TemplateDB {
  static collection = 'templates';
  static _data = {};

  static async init() {
    this._data = await LocalDB.get(this.collection, this._getDefaults());
    if (Object.keys(this._data).length === 0) {
      await LocalDB.save(this.collection, this._getDefaults());
      this._data = this._getDefaults();
    }
  }

  static get(id) {
    return this._data[id] || null;
  }

  static getAll() {
    return this._data;
  }

  static async save(id, properties) {
    this._data[id] = properties;
    await LocalDB.save(this.collection, this._data);
  }

  static _getDefaults() {
    return {
      crate: {
        isBreakable: true,
        hasPhysics: true,
        hp: 3,
        bounce: 0.15,
        label: "Caixote de Madeira"
      },
      barrel: {
        isBreakable: true,
        hasPhysics: true,
        hp: 5,
        bounce: 0.25,
        label: "Barril Explosivo"
      },
      pickup: {
        isCollectable: true,
        isBreakable: false,
        hasPhysics: false,
        label: "Item Coletável"
      },
      static: {
        isBreakable: false,
        hasPhysics: false,
        isCollectable: false,
        label: "Prop Estático"
      }
    };
  }
}
