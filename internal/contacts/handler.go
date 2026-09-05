package contacts

import (
	"crmProject/internal/db"
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type CreateContactInput struct {
	Name      string `json:"name" binding:"required"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	CompanyID *int   `json:"company_id"`
}

type UpdateContactInput struct {
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	CompanyID *int   `json:"company_id"`
}

type CreateCompanyInput struct {
	Name    string `json:"name" binding:"required"`
	INN     string `json:"inn"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Website string `json:"website"`
}

type UpdateCompanyInput struct {
	Name    string `json:"name"`
	INN     string `json:"inn"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Website string `json:"website"`
}

// === Contacts ===

func GetContacts(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT ct.id, ct.name, ct.phone, ct.email, ct.company_id, COALESCE(co.name,''), ct.created_at
		FROM contacts ct
		LEFT JOIN companies co ON ct.company_id = co.id
		ORDER BY ct.name ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contacts"})
		return
	}
	defer rows.Close()

	list := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var name, phone, email, companyName, createdAt string
		var companyID sql.NullInt32
		if rows.Scan(&id, &name, &phone, &email, &companyID, &companyName, &createdAt) == nil {
			item := gin.H{
				"id": id, "name": name, "phone": phone,
				"email": email, "company_name": companyName, "created_at": createdAt,
			}
			if companyID.Valid {
				item["company_id"] = companyID.Int32
			} else {
				item["company_id"] = nil
			}
			list = append(list, item)
		}
	}
	c.JSON(http.StatusOK, list)
}

func CreateContact(c *gin.Context) {
	var input CreateContactInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec(`INSERT INTO contacts (name, phone, email, company_id) VALUES (?, ?, ?, ?)`,
		input.Name, input.Phone, input.Email, input.CompanyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create contact"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "phone": input.Phone, "email": input.Email})
}

func UpdateContact(c *gin.Context) {
	id := c.Param("id")
	var input UpdateContactInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var name, phone, email string
	var companyID sql.NullInt32
	_ = db.DB.QueryRow("SELECT name, phone, email, company_id FROM contacts WHERE id = ?", id).
		Scan(&name, &phone, &email, &companyID)

	if input.Name != "" {
		name = input.Name
	}
	if input.Phone != "" {
		phone = input.Phone
	}
	if input.Email != "" {
		email = input.Email
	}

	_, err := db.DB.Exec("UPDATE contacts SET name=?, phone=?, email=?, company_id=? WHERE id=?",
		name, phone, email, input.CompanyID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update contact"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contact updated"})
}

func DeleteContact(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM contacts WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete contact"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contact deleted"})
}

// === Companies ===

func GetCompanies(c *gin.Context) {
	rows, err := db.DB.Query(`SELECT id, name, inn, phone, email, website, created_at FROM companies ORDER BY name ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch companies"})
		return
	}
	defer rows.Close()

	list := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var name, inn, phone, email, website, createdAt string
		if rows.Scan(&id, &name, &inn, &phone, &email, &website, &createdAt) == nil {
			list = append(list, gin.H{
				"id": id, "name": name, "inn": inn,
				"phone": phone, "email": email, "website": website, "created_at": createdAt,
			})
		}
	}
	c.JSON(http.StatusOK, list)
}

func CreateCompany(c *gin.Context) {
	var input CreateCompanyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec(`INSERT INTO companies (name, inn, phone, email, website) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.INN, input.Phone, input.Email, input.Website)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create company"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "inn": input.INN})
}

func UpdateCompany(c *gin.Context) {
	id := c.Param("id")
	var input UpdateCompanyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var name, inn, phone, email, website string
	_ = db.DB.QueryRow("SELECT name, inn, phone, email, website FROM companies WHERE id = ?", id).
		Scan(&name, &inn, &phone, &email, &website)

	if input.Name != "" {
		name = input.Name
	}
	if input.INN != "" {
		inn = input.INN
	}
	if input.Phone != "" {
		phone = input.Phone
	}
	if input.Email != "" {
		email = input.Email
	}
	if input.Website != "" {
		website = input.Website
	}

	_, err := db.DB.Exec("UPDATE companies SET name=?, inn=?, phone=?, email=?, website=? WHERE id=?",
		name, inn, phone, email, website, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update company"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Company updated"})
}

func DeleteCompany(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM companies WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete company"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Company deleted"})
}

// === Client Counterparties ===

func GetClientCounterparties(c *gin.Context) {
	clientID := c.Param("id")

	contactRows, _ := db.DB.Query(`
		SELECT ct.id, ct.name, ct.phone, ct.email, ct.company_id, COALESCE(co.name,''), ct.created_at
		FROM client_contacts cc
		JOIN contacts ct ON cc.contact_id = ct.id
		LEFT JOIN companies co ON ct.company_id = co.id
		WHERE cc.client_id = ?`, clientID)
	defer func() {
		if contactRows != nil {
			_ = contactRows.Close()
		}
	}()

	linkedContacts := make([]gin.H, 0)
	if contactRows != nil {
		for contactRows.Next() {
			var id int
			var name, phone, email, companyName, createdAt string
			var companyID sql.NullInt32
			if contactRows.Scan(&id, &name, &phone, &email, &companyID, &companyName, &createdAt) == nil {
				item := gin.H{"id": id, "name": name, "phone": phone, "email": email, "company_name": companyName, "created_at": createdAt}
				if companyID.Valid {
					item["company_id"] = companyID.Int32
				}
				linkedContacts = append(linkedContacts, item)
			}
		}
	}

	companyRows, _ := db.DB.Query(`
		SELECT co.id, co.name, co.inn, co.phone, co.email, co.website, co.created_at
		FROM client_companies cc
		JOIN companies co ON cc.company_id = co.id
		WHERE cc.client_id = ?`, clientID)
	defer func() {
		if companyRows != nil {
			_ = companyRows.Close()
		}
	}()

	linkedCompanies := make([]gin.H, 0)
	if companyRows != nil {
		for companyRows.Next() {
			var id int
			var name, inn, phone, email, website, createdAt string
			if companyRows.Scan(&id, &name, &inn, &phone, &email, &website, &createdAt) == nil {
				linkedCompanies = append(linkedCompanies, gin.H{
					"id": id, "name": name, "inn": inn, "phone": phone,
					"email": email, "website": website, "created_at": createdAt,
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"contacts": linkedContacts, "companies": linkedCompanies})
}

func LinkContactToClient(c *gin.Context) {
	clientID := c.Param("id")
	var input struct {
		ContactID int `json:"contact_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := db.DB.Exec("INSERT OR IGNORE INTO client_contacts (client_id, contact_id) VALUES (?, ?)",
		clientID, input.ContactID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link contact"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contact linked"})
}

func UnlinkContactFromClient(c *gin.Context) {
	clientID := c.Param("id")
	contactID := c.Param("contactId")
	_, _ = db.DB.Exec("DELETE FROM client_contacts WHERE client_id = ? AND contact_id = ?", clientID, contactID)
	c.JSON(http.StatusOK, gin.H{"message": "Contact unlinked"})
}

func LinkCompanyToClient(c *gin.Context) {
	clientID := c.Param("id")
	var input struct {
		CompanyID int `json:"company_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := db.DB.Exec("INSERT OR IGNORE INTO client_companies (client_id, company_id) VALUES (?, ?)",
		clientID, input.CompanyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link company"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Company linked"})
}

func UnlinkCompanyFromClient(c *gin.Context) {
	clientID := c.Param("id")
	companyID := c.Param("companyId")
	_, _ = db.DB.Exec("DELETE FROM client_companies WHERE client_id = ? AND company_id = ?", clientID, companyID)
	c.JSON(http.StatusOK, gin.H{"message": "Company unlinked"})
}
