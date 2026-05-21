/**
 * Mock setup for state-manager.ts dependencies to ensure tests run deterministically.
 * This file simulates the necessary database/service layer responses for testing.
 */

// Mock DB interaction functions
export const mockGetGatewayState = jest.fn();
export const mockSaveGatewayMessage = jest.fn();
export const mockUpdateMessageStatus = jest.fn();

// Exporting mocks to be used by the test file
export const mockDependencies = {
    getGatewayState: mockGetGatewayState,
    saveGatewayMessage: mockSaveGatewayMessage,
    updateMessageStatus: mockUpdateMessageStatus,
};