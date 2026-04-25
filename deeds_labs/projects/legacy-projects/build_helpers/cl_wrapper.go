package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func findRealCl() (string, error) {
	scriptDir, err := filepath.Abs(filepath.Dir(os.Args[0]))
	if err != nil {
		return "", err
	}

	paths := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))
	for _, path := range paths {
		// Skip the directory where our wrapper cl.exe resides to avoid infinite recursion
		if strings.EqualFold(path, scriptDir) {
			continue
		}
		clPath := filepath.Join(path, "cl.exe")
		if _, err := os.Stat(clPath); err == nil {
			return clPath, nil
		}
	}
	return "", fmt.Errorf("could not find real cl.exe in PATH")
}

func main() {
	realCl, err := findRealCl()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	var args []string
	for _, arg := range os.Args[1:] {
		if !strings.EqualFold(arg, "/Werror") {
			args = append(args, arg)
		}
	}

	cmd := exec.Command(realCl, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	err = cmd.Run()
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			os.Exit(exitError.ExitCode())
		} else {
			fmt.Fprintf(os.Stderr, "Error running real cl.exe: %v\n", err)
			os.Exit(1)
		}
	}
}
