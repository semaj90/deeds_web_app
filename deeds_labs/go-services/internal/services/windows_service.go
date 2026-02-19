//go:build windows
// +build windows

/**
 * Windows Service Wrapper
 * Production-ready Windows service implementation for all microservices
 */

package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

// WindowsService interface for all services
type WindowsService interface {
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Name() string
	Description() string
}

// ServiceManager handles Windows service lifecycle
type ServiceManager struct {
	service     WindowsService
	eventLog    *eventlog.Log
	interactive bool
	stopCh      chan struct{}
}

// NewServiceManager creates a new Windows service manager
func NewServiceManager(service WindowsService) *ServiceManager {
	return &ServiceManager{
		service: service,
		stopCh:  make(chan struct{}),
	}
}

// Run starts the service in Windows service mode or interactive mode
func (sm *ServiceManager) Run() error {
	var err error

	// Determine whether running as a Windows service (preferred API)
	isService, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("failed to determine service mode: %v", err)
	}

	// store interactive flag for internal use (interactive when NOT running as a service)
	sm.interactive = !isService

	if sm.interactive {
		return sm.runInteractive()
	} else {
		return sm.runService()
	}
}

// runInteractive runs the service in interactive mode (for development)
func (sm *ServiceManager) runInteractive() error {
	log.Printf("Starting %s in interactive mode", sm.service.Name())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the service
	if err := sm.service.Start(ctx); err != nil {
		return fmt.Errorf("failed to start service: %v", err)
	}

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt)

	log.Printf("%s started successfully", sm.service.Name())
	<-sigChan

	log.Printf("Shutting down %s...", sm.service.Name())

	// Graceful shutdown with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	return sm.service.Stop(shutdownCtx)
}

// runService runs as a Windows service
func (sm *ServiceManager) runService() error {
	// Initialize event log
	var err error
	sm.eventLog, err = eventlog.Open(sm.service.Name())
	if err != nil {
		return fmt.Errorf("failed to open event log: %v", err)
	}
	defer sm.eventLog.Close()

	sm.eventLog.Info(1, fmt.Sprintf("%s service starting", sm.service.Name()))

	// Run the service
	return svc.Run(sm.service.Name(), sm)
}

// Execute implements the Windows service interface
func (sm *ServiceManager) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown | svc.AcceptPauseAndContinue
	changes <- svc.Status{State: svc.StartPending}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the service
	if err := sm.service.Start(ctx); err != nil {
		sm.eventLog.Error(1, fmt.Sprintf("Failed to start service: %v", err))
		changes <- svc.Status{State: svc.StopPending}
		return false, 1
	}

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
	sm.eventLog.Info(1, fmt.Sprintf("%s service started successfully", sm.service.Name()))

	// Service main loop
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				sm.eventLog.Info(1, fmt.Sprintf("%s service stopping", sm.service.Name()))
				changes <- svc.Status{State: svc.StopPending}

				// Graceful shutdown
				shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
				if err := sm.service.Stop(shutdownCtx); err != nil {
					sm.eventLog.Error(1, fmt.Sprintf("Error stopping service: %v", err))
				}
				shutdownCancel()

				changes <- svc.Status{State: svc.Stopped}
				return false, 0
			case svc.Pause:
				changes <- svc.Status{State: svc.Paused, Accepts: cmdsAccepted}
			case svc.Continue:
				changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
			default:
				sm.eventLog.Error(1, fmt.Sprintf("Unexpected control request: %v", c))
			}
		case <-sm.stopCh:
			changes <- svc.Status{State: svc.StopPending}
			changes <- svc.Status{State: svc.Stopped}
			return false, 0
		}
	}
}

// InstallService installs the service in Windows
func InstallService(name, desc, exePath string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", name)
	}

	s, err = m.CreateService(name, exePath, mgr.Config{
		DisplayName:      desc,
		Description:      desc,
		StartType:        mgr.StartAutomatic,
		ServiceStartName: `NT AUTHORITY\LocalService`,
	})
	if err != nil {
		return fmt.Errorf("failed to create service: %v", err)
	}
	defer s.Close()

	err = eventlog.InstallAsEventCreate(name, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err != nil {
		return fmt.Errorf("failed to install event log: %v", err)
	}

	return nil
}

// UninstallService removes the service from Windows
func UninstallService(name string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		return fmt.Errorf("failed to open service: %v", err)
	}
	defer s.Close()

	err = s.Delete()
	if err != nil {
		return fmt.Errorf("failed to delete service: %v", err)
	}

	err = eventlog.Remove(name)
	if err != nil {
		return fmt.Errorf("failed to remove event log: %v", err)
	}

	return nil
}

// StartService starts a Windows service
func StartService(name string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		return fmt.Errorf("failed to open service: %v", err)
	}
	defer s.Close()

	return s.Start()
}

// StopService stops a Windows service
func StopService(name string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		return fmt.Errorf("failed to open service: %v", err)
	}
	defer s.Close()

	status, err := s.Control(svc.Stop)
	if err != nil {
		return fmt.Errorf("failed to stop service: %v", err)
	}

	timeout := time.Now().Add(30 * time.Second)
	for status.State != svc.Stopped {
		if timeout.Before(time.Now()) {
			return fmt.Errorf("timeout waiting for service to stop")
		}
		time.Sleep(300 * time.Millisecond)
		status, err = s.Query()
		if err != nil {
			return fmt.Errorf("failed to query service status: %v", err)
		}
	}

	return nil
}

// ServiceStatus returns the status of a Windows service
func ServiceStatus(name string) (svc.State, error) {
	m, err := mgr.Connect()
	if err != nil {
		return svc.Stopped, fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		return svc.Stopped, fmt.Errorf("failed to open service: %v", err)
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return svc.Stopped, fmt.Errorf("failed to query service: %v", err)
	}

	return status.State, nil
}