export {
	registerBackupRoutes,
	registerCertificateRoutes,
	registerConfigCoreRoutes,
	registerDnsRoutes,
	registerEndpointRoutes,
	registerExperimentalRoutes,
	registerExportImportRoutes,
	registerInboundRoutes,
	registerLogRoutes,
	registerNtpRoutes,
	registerOutboundRoutes,
	registerRouteRoutes,
	registerRuleSetRoutes,
	registerServiceRoutes,
} from './config';
export { registerDiffRoutes } from './diff';
export { registerHealthRoutes } from './health';
export { registerServerRoutes } from './server';
export { registerSingboxRoutes } from './singbox';
export { registerStateRoutes } from './state';
export type { RouterType } from './types';
