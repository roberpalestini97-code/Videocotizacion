// Healthcheck mínimo para la imagen de la API (sin shell, sin curl, sin wget).
// Uso: /healthcheck http://127.0.0.1:8080/v1/version
// Sale con 0 si la respuesta es 2xx y con 1 si no. Solo acepta destinos de loopback.
package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"
)

const plazo = 3 * time.Second

func esLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func comprobar(ctx context.Context, destino string) error {
	u, err := url.Parse(destino)
	if err != nil {
		return fmt.Errorf("url inválida: %w", err)
	}
	if u.Scheme != "http" || !esLoopback(u.Hostname()) {
		return errors.New("solo se admite http hacia loopback")
	}
	ctx, cancelar := context.WithTimeout(ctx, plazo)
	defer cancelar()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, destino, nil)
	if err != nil {
		return fmt.Errorf("armar pedido: %w", err)
	}
	cliente := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := cliente.Do(req)
	if err != nil {
		return fmt.Errorf("pedido: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("estado %d", resp.StatusCode)
	}
	return nil
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "uso: healthcheck <url-loopback>")
		os.Exit(2)
	}
	if err := comprobar(context.Background(), os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		os.Exit(1)
	}
}
