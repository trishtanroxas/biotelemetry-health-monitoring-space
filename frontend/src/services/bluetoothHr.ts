export interface BluetoothHrReading {
  heartRate: number;
  rrIntervalsMs: number[];
  rmssdMs: number | null;
  timestamp: string;
}

export type BluetoothConnectionStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected';

interface BleNavigator {
  bluetooth?: {
    requestDevice(options: { filters: Array<{ services: number[] }> }): Promise<BleDevice>;
  };
}

interface BleDevice {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<BleServer>;
    disconnect(): void;
  };
  addEventListener(type: string, listener: () => void): void;
}

interface BleServer {
  getPrimaryService(service: number): Promise<BleService>;
}

interface BleService {
  getCharacteristic(characteristic: number): Promise<BleCharacteristic>;
}

interface BleCharacteristic {
  value?: DataView;
  startNotifications(): Promise<BleCharacteristic>;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export function isBluetoothHrSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as unknown as BleNavigator).bluetooth);
}

// Decodes GATT Heart Rate Measurement (0x2A37) per Bluetooth SIG specification
export function parseHeartRateMeasurement(view: DataView): BluetoothHrReading | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  const hasEnergyExpended = (flags & 0x08) !== 0;
  const hasRrIntervals = (flags & 0x10) !== 0;

  let offset = 1;
  let heartRate: number;
  if (is16Bit) {
    if (view.byteLength < offset + 2) return null;
    heartRate = view.getUint16(offset, true);
    offset += 2;
  } else {
    heartRate = view.getUint8(offset);
    offset += 1;
  }

  if (heartRate < 20 || heartRate > 250) return null;

  if (hasEnergyExpended) {
    if (offset + 2 > view.byteLength) return { heartRate, rrIntervalsMs: [], rmssdMs: null, timestamp: new Date().toISOString() };
    offset += 2;
  }

  const rrIntervalsMs: number[] = [];
  if (hasRrIntervals) {
    while (offset + 1 < view.byteLength) {
      const rawRr = view.getUint16(offset, true);
      const ms = Math.round((rawRr / 1024) * 1000 * 10) / 10;
      if (ms > 200 && ms < 3000) rrIntervalsMs.push(ms);
      offset += 2;
    }
  }

  let rmssdMs: number | null = null;
  if (rrIntervalsMs.length >= 2) {
    let sumSq = 0;
    for (let i = 1; i < rrIntervalsMs.length; i++) {
      const diff = rrIntervalsMs[i] - rrIntervalsMs[i - 1];
      sumSq += diff * diff;
    }
    rmssdMs = Math.round(Math.sqrt(sumSq / (rrIntervalsMs.length - 1)) * 10) / 10;
  }

  return {
    heartRate,
    rrIntervalsMs,
    rmssdMs,
    timestamp: new Date().toISOString(),
  };
}

export interface BluetoothHrSession {
  deviceName: string;
  disconnect(): void;
}

export async function connectBluetoothHr(
  onReading: (reading: BluetoothHrReading) => void,
  onDisconnect: () => void,
): Promise<BluetoothHrSession> {
  const ble = (navigator as unknown as BleNavigator).bluetooth;
  if (!ble) {
    throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge over HTTPS/localhost.');
  }

  const device = await ble.requestDevice({ filters: [{ services: [0x180d] }] });
  if (!device.gatt) {
    throw new Error('Selected Bluetooth device does not expose a GATT server.');
  }

  device.addEventListener('gattserverdisconnected', onDisconnect);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(0x180d);
  const characteristic = await service.getCharacteristic(0x2a37);

  characteristic.addEventListener('characteristicvaluechanged', event => {
    const target = event.target as unknown as BleCharacteristic | null;
    if (!target?.value) return;
    const parsed = parseHeartRateMeasurement(target.value);
    if (parsed) onReading(parsed);
  });

  await characteristic.startNotifications();

  return {
    deviceName: device.name || 'Bluetooth HR Sensor',
    disconnect: () => {
      try {
        if (device.gatt?.connected) device.gatt.disconnect();
      } catch {
        // Ignore teardown errors on already-closed GATT links
      }
    },
  };
}
