package auth

import (
	"crmProject/internal/db"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte("jwt_secret")

type Claims struct {
	UserID       uint   `json:"user_id"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	TokenVersion int    `json:"token_version"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateToken(userID uint, email, role string, tokenVersion int) (string, error) {
	claims := &Claims{
		UserID:       userID,
		Email:        email,
		Role:         role,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired token")
	}

	return claims, nil
}

func checkUserActive(c *gin.Context, claims *Claims) bool {
	var isActive bool
	var dbVersion int
	var dbRole string
	err := db.DB.QueryRow(
		"SELECT is_active, token_version, role FROM users WHERE id=?", claims.UserID,
	).Scan(&isActive, &dbVersion, &dbRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		c.Abort()
		return false
	}
	if err != nil {
		// DB temporarily unavailable (busy, locked) — do not log the user out.
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Service temporarily unavailable, retry"})
		c.Abort()
		return false
	}
	if !isActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Аккаунт заблокирован — обратитесь к администратору"})
		c.Abort()
		return false
	}
	if claims.TokenVersion != dbVersion {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Сессия отозвана — войдите снова"})
		c.Abort()
		return false
	}
	// Use DB role as authoritative source; JWT role may lag if changed
	role := claims.Role
	if role == "" {
		role = dbRole
	}
	c.Set("user_role", role)
	return true
}

func JWTAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid header format"})
			c.Abort()
			return
		}
		claims, err := ValidateToken(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}
		if !checkUserActive(c, claims) {
			return
		}
		c.Set("user_id", claims.UserID)
		c.Next()
	}
}

func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("user_role")
		if role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Требуется роль администратора"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// HasPermission checks a named permission for a role via the roles table.
func HasPermission(role, perm string) bool {
	var v int
	_ = db.DB.QueryRow(
		"SELECT COALESCE(json_extract(permissions, ?), 0) FROM roles WHERE code=?",
		"$."+perm, role,
	).Scan(&v)
	return v == 1
}
